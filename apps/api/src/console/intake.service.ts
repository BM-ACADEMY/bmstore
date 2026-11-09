import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, StoreIntake, Tenant } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { AppConfig } from '../config/app-config';
import { AuthActor } from '../common/request-context';
import { slugify, uniqueSlug } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { SuperadminTenantsService } from '../superadmin/tenants.service';
import { TenantResolver } from '../tenancy/tenant-resolver.service';
import { ConsoleScope, safeTenant } from './console-scope';
import { missingFields, normalizeIntake, NormalizedIntake } from './intake';
import { themeFor } from './layouts';
import { PolicyResult, PolicyService } from './policy.service';
import { ConsoleEvents } from './events';

export interface CreateFromIntakeResult {
  created: boolean;
  store: { id: string; name: string; slug: string; subdomain: string; status: string; url: string; adminUrl: string };
  intake: { complete: boolean; missing: string[]; completedAt: string | null };
  /** temporaryPassword is shown ONCE (on the call that created the login) and never stored or logged in plain text. */
  ownerLogin: { email: string; temporaryPassword: string | null; loginUrl: string } | null;
  policies: PolicyResult[];
}

const INTAKE_COLUMNS = ['businessName', 'ownerName', 'whatsapp', 'email', 'category', 'logoUrl', 'brandColors', 'productSheet', 'gstNumber', 'address', 'domain', 'razorpayStatus', 'shipping', 'codEnabled', 'codChargePaise', 'aboutText', 'layout'] as const;

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ConsoleScope,
    private readonly auth: AuthService,
    private readonly tenants: SuperadminTenantsService,
    private readonly resolver: TenantResolver,
    private readonly policies: PolicyService,
    private readonly cfg: AppConfig,
    private readonly events: ConsoleEvents,
  ) {}

  private get db() { return this.prisma.db; }

  /**
   * Create store from intake. IDEMPOTENT on the intake key: the same intake twice gives the same store, one owner
   * login, four policy pages. A re-run fills in what is missing (new intake details, settings/theme/owner/policies
   * that do not exist yet) and never overwrites the developer's work on the store.
   */
  async createFromIntake(actor: AuthActor, body: Record<string, any>): Promise<CreateFromIntakeResult> {
    const n = normalizeIntake(body);
    return this.oneAtATime(() => this.createOrReapply(actor, n));
  }

  /**
   * Store creation runs one at a time per API process. Creating holds an interactive transaction on the owner
   * connection while the audited bypass writes each audit row on ANOTHER owner connection; several creations at once
   * could take every pooled connection and wait on each other until timeout (seen on 2-core CI: pool of 5).
   * Creation is a rare developer action, so queueing costs nothing. Across processes the unique intake_key still
   * guarantees a single store (see the P2002 handling below).
   */
  private queue: Promise<unknown> = Promise.resolve();
  private oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async createOrReapply(actor: AuthActor, n: NormalizedIntake): Promise<CreateFromIntakeResult> {
    const existing = await this.scope.platform(actor, 'find-intake', () => this.db.storeIntake.findUnique({ where: { intakeKey: n.intakeKey } }));
    if (existing) return this.reapply(actor, existing.tenantId, n);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.createNew(actor, n);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        // Identical submissions racing: the loser finds the winner's store (it may have lost on the subdomain first).
        const won = await this.scope.platform(actor, 'find-intake', () => this.db.storeIntake.findUnique({ where: { intakeKey: n.intakeKey } }));
        if (won) return this.reapply(actor, won.tenantId, n);
        // A different store took the derived subdomain at the same moment: pick again.
        if (n.subdomain || attempt >= 2) throw new ConflictException('That store address is already taken; choose another subdomain');
      }
    }
  }

  private intakeData(n: NormalizedIntake) {
    return {
      businessName: n.businessName, ownerName: n.ownerName, whatsapp: n.whatsapp, email: n.email, category: n.category, logoUrl: n.logoUrl,
      brandColors: n.brandColors, productSheet: n.productSheet, gstNumber: n.gstNumber, address: n.address, domain: n.domain,
      razorpayStatus: n.razorpayStatus, shipping: (n.shipping ?? {}) as Prisma.InputJsonValue, codEnabled: n.codEnabled, codChargePaise: n.codChargePaise,
      aboutText: n.aboutText, layout: n.layout,
    };
  }

  private async pickSubdomain(actor: AuthActor, n: NormalizedIntake): Promise<string> {
    const wanted = n.subdomain ?? slugify(n.businessName, 'store').slice(0, 40).replace(/-+$/, '');
    if (this.cfg.reservedSubdomains.has(wanted)) throw new BadRequestException('That subdomain is reserved');
    if (n.subdomain) return n.subdomain; // explicit: a clash is a 409, not a silent rename
    return this.scope.platform(actor, 'pick-subdomain', () =>
      uniqueSlug(wanted, async (s) => this.cfg.reservedSubdomains.has(s) || (await this.db.tenant.count({ where: { OR: [{ slug: s }, { subdomain: s }] } })) > 0),
    );
  }

  private async createNew(actor: AuthActor, n: NormalizedIntake): Promise<CreateFromIntakeResult> {
    const sub = await this.pickSubdomain(actor, n);
    const theme = themeFor(n.layout, n.brandColors);
    const missing = missingFields(n);
    // The owner login is created in the same transaction, so a racing duplicate can never add a second one.
    const temporaryPassword = n.email ? randomBytes(12).toString('base64url') : null;
    const passwordHash = temporaryPassword ? await this.auth.hashPassword(temporaryPassword) : null;
    const tenant: Tenant = await this.scope.platform(actor, 'create-from-intake', () =>
      this.db.$transaction(async (tx: any) => {
        const t = await tx.tenant.create({
          data: {
            name: n.businessName, slug: sub, subdomain: sub, status: 'BUILDING', plan: n.plan,
            gstNumber: n.gstNumber, address: n.address, supportPhone: n.whatsapp, whatsappNumber: n.whatsapp,
          },
        });
        await tx.storeIntake.create({ data: { tenantId: t.id, intakeKey: n.intakeKey, ...this.intakeData(n), completedAt: missing.length ? null : new Date() } });
        await tx.settings.create({ data: this.settingsFrom(t.id, n) });
        await tx.themeConfig.create({ data: { tenantId: t.id, ...theme, homepageSections: theme.homepageSections as Prisma.InputJsonValue } });
        if (passwordHash) await tx.user.create({ data: { tenantId: t.id, email: n.email, phone: n.whatsapp, passwordHash, role: 'store_owner' } });
        return t;
      }),
    );
    await this.resolver.invalidate(tenant);
    await this.tenants.record(actor, 'tenant.created', tenant.id, { slug: tenant.slug, via: 'console.create_from_intake' });
    const result = await this.finish(actor, tenant.id, n, true, temporaryPassword);
    await this.events.storeCreated(tenant.id);
    if (!missing.length) await this.events.intakeCompleted(tenant.id);
    return result;
  }

  private settingsFrom(tenantId: string, n: NormalizedIntake) {
    return {
      tenantId,
      shippingMode: n.shipping?.mode ?? 'FLAT',
      flatRate: n.shipping?.flatRatePaise ?? 0,
      freeAbove: n.shipping?.freeAbovePaise ?? null,
      codEnabled: n.codEnabled ?? false, // COD is opt-in: off until the client says yes
      codCharge: n.codChargePaise,
    };
  }

  /** Existing store: merge new intake details, create whatever is still missing. Never overwrites store config. */
  private async reapply(actor: AuthActor, tenantId: string, n: NormalizedIntake): Promise<CreateFromIntakeResult> {
    const { justCompleted } = await this.mergeIntake(actor, tenantId, n);
    const res = await this.finish(actor, tenantId, n, false);
    if (justCompleted) await this.events.intakeCompleted(tenantId);
    return res;
  }

  /** Fill blank intake fields from `n` (non-empty values win; existing values are only replaced by new non-empty ones). */
  private async mergeIntake(actor: AuthActor | null, tenantId: string, n: Partial<NormalizedIntake>) {
    return this.scope.inTenant(actor, tenantId, async () => {
      const cur = await this.db.storeIntake.findUniqueOrThrow({ where: { tenantId } });
      const data: Record<string, unknown> = {};
      for (const k of INTAKE_COLUMNS) {
        const v = (n as any)[k];
        const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (k === 'razorpayStatus' && v === 'not_started' && cur.razorpayStatus !== 'not_started');
        if (!empty) data[k] = k === 'shipping' ? (v as Prisma.InputJsonValue) : v;
      }
      const merged = { ...cur, ...data } as StoreIntake;
      const justCompleted = !cur.completedAt && missingFields(merged as any).length === 0;
      if (justCompleted) data.completedAt = new Date();
      await this.db.storeIntake.update({ where: { tenantId }, data });
      // Contact details the store shows: fill only if blank on the tenant.
      const t = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const tData: Record<string, unknown> = {};
      if (!t.whatsappNumber && merged.whatsapp) tData.whatsappNumber = merged.whatsapp;
      if (!t.supportPhone && merged.whatsapp) tData.supportPhone = merged.whatsapp;
      if (!t.address && merged.address) tData.address = merged.address;
      if (!t.gstNumber && merged.gstNumber) tData.gstNumber = merged.gstNumber;
      if (Object.keys(tData).length) {
        const after = await this.db.tenant.update({ where: { id: tenantId }, data: tData });
        await this.resolver.invalidate(after);
      }
      return { justCompleted, intake: { ...merged, completedAt: (data.completedAt as Date) ?? cur.completedAt } };
    });
  }

  /** Steps shared by create and re-run, all inside the store's tenant scope; each creates only what is missing. */
  private async finish(actor: AuthActor, tenantId: string, n: NormalizedIntake, fresh: boolean, createdPassword: string | null = null): Promise<CreateFromIntakeResult> {
    let ownerLogin: CreateFromIntakeResult['ownerLogin'] = null;
    const out = await this.scope.inTenant(actor, tenantId, async () => {
      const db = this.db;
      if (!fresh) {
        await db.settings.upsert({ where: { tenantId }, create: this.settingsFrom(tenantId, n), update: {} });
        const theme = themeFor(n.layout, n.brandColors);
        await db.themeConfig.upsert({ where: { tenantId }, create: { tenantId, ...theme, homepageSections: theme.homepageSections as Prisma.InputJsonValue }, update: {} });
      }
      const intake = await db.storeIntake.findUniqueOrThrow({ where: { tenantId } });
      const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      // Store-owner login: one per store. Created once an email is known.
      const owner = await db.user.findFirst({ where: { role: 'store_owner' }, orderBy: { createdAt: 'asc' } });
      if (owner) ownerLogin = { email: owner.email, temporaryPassword: createdPassword, loginUrl: `${this.scope.adminUrl(t)}/login` };
      else if (intake.email) {
        const temporaryPassword = randomBytes(12).toString('base64url');
        const made = await db.user.createMany({ data: [{ tenantId, email: intake.email, phone: intake.whatsapp, passwordHash: await this.auth.hashPassword(temporaryPassword), role: 'store_owner' }], skipDuplicates: true });
        ownerLogin = { email: intake.email, temporaryPassword: made.count ? temporaryPassword : null, loginUrl: `${this.scope.adminUrl(t)}/login` };
      }

      const policies = await this.policies.writeForCurrentTenant(tenantId, {
        overwrite: false,
        extra: { email: intake.email, ownerName: intake.ownerName, shippingNotes: (intake.shipping as any)?.notes ?? null },
      });

      if (intake.aboutText) {
        const about = await db.page.findUnique({ where: { tenantId_slug: { tenantId, slug: 'about' } } });
        if (!about) await db.page.createMany({ data: [{ tenantId, slug: 'about', title: `About ${t.name}`, content: intake.aboutText, isPolicy: false }], skipDuplicates: true });
      }
      const missing = missingFields(intake as any);
      return { t, intake, missing, policies };
    });
    await this.scope.audit(actor.id, tenantId, fresh ? 'console.store_created_from_intake' : 'console.intake_reapplied', {
      intakeKey: n.intakeKey, ownerCreated: Boolean((ownerLogin as any)?.temporaryPassword), complete: out.missing.length === 0,
    });
    const t = safeTenant(out.t);
    return {
      created: fresh,
      store: { id: t.id, name: t.name, slug: t.slug, subdomain: t.subdomain, status: t.status, url: this.scope.storeUrl(t), adminUrl: this.scope.adminUrl(t) },
      intake: { complete: out.missing.length === 0, missing: out.missing, completedAt: out.intake.completedAt?.toISOString() ?? null },
      ownerLogin,
      policies: out.policies,
    };
  }

  /** Intake as the console shows it. */
  async get(actor: AuthActor, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, async () => {
      const i = await this.db.storeIntake.findUnique({ where: { tenantId } });
      return i ? { ...i, missing: missingFields(i as any), complete: !!i.completedAt } : null;
    });
  }

  /** Developer fills in details that arrived later (WhatsApp, calls). Same merge rules as a re-run. */
  async update(actor: AuthActor, tenantId: string, patch: Record<string, any>) {
    const cur = await this.scope.inTenant(actor, tenantId, () => this.db.storeIntake.findUnique({ where: { tenantId } }));
    if (!cur) throw new BadRequestException('This store was not created from an intake');
    const n = normalizeIntake({ ...cur, codChargePaise: cur.codChargePaise, ...patch, intakeKey: cur.intakeKey });
    return this.oneAtATime(() => this.reapply(actor, tenantId, n));
  }
}
