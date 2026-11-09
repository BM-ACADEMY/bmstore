import { Injectable } from '@nestjs/common';
import { AuthActor } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';
import { generatePolicies, PolicyInput } from './policies';

export interface PolicyResult { slug: string; title: string; action: 'created' | 'updated' | 'kept' }

/** Writes the four generated policy pages into a store (inside that store's tenant scope). */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ConsoleScope) {}

  /** Gather the tenant's own details. Must run inside the tenant scope. */
  private async input(tenantId: string, extra: Partial<PolicyInput>): Promise<PolicyInput> {
    const db = this.prisma.db;
    const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const s = await db.settings.findUnique({ where: { tenantId } });
    const owner = await db.user.findFirst({ where: { role: 'store_owner' }, orderBy: { createdAt: 'asc' }, select: { email: true } });
    return {
      businessName: t.name,
      email: owner?.email ?? null,
      whatsapp: t.whatsappNumber,
      supportPhone: t.supportPhone,
      address: t.address,
      gstNumber: t.gstNumber,
      storeUrl: this.scope.storeUrl(t),
      shippingMode: s?.shippingMode ?? 'FLAT',
      flatRatePaise: s?.flatRate ?? 0,
      freeAbovePaise: s?.freeAbove ?? null,
      cityRates: Array.isArray(s?.cityRates) ? (s!.cityRates as any[]) : [],
      codEnabled: s?.codEnabled ?? false,
      codChargePaise: s?.codCharge ?? 0,
      onlinePayments: Boolean(t.razorpayKeyEnc && t.razorpaySecretEnc),
      effectiveDate: new Date(),
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
    } as PolicyInput;
  }

  /**
   * Generate and store the pages. `overwrite: false` keeps any page that already has content (so a developer's
   * edits survive a re-run of create-from-intake); `true` replaces the four generated pages.
   * Runs inside the tenant scope (call through ConsoleScope.inTenant / asTenant).
   */
  async writeForCurrentTenant(tenantId: string, opts: { overwrite: boolean; extra?: Partial<PolicyInput> }): Promise<PolicyResult[]> {
    const db = this.prisma.db;
    const pages = generatePolicies(await this.input(tenantId, opts.extra ?? {}));
    const out: PolicyResult[] = [];
    for (const p of pages) {
      const cur = await db.page.findUnique({ where: { tenantId_slug: { tenantId, slug: p.slug } } });
      if (!cur) {
        // skipDuplicates: a concurrent run that created it first wins; this one reports "kept".
        const made = await db.page.createMany({ data: [{ tenantId, slug: p.slug, title: p.title, content: p.content, isPolicy: true }], skipDuplicates: true });
        out.push({ slug: p.slug, title: p.title, action: made.count ? 'created' : 'kept' });
      } else if (opts.overwrite || !cur.content.trim()) {
        await db.page.update({ where: { id: cur.id }, data: { title: p.title, content: p.content, isPolicy: true } });
        out.push({ slug: p.slug, title: p.title, action: 'updated' });
      } else out.push({ slug: p.slug, title: p.title, action: 'kept' });
    }
    return out;
  }

  async generate(actor: AuthActor, tenantId: string, overwrite = true, extra: Partial<PolicyInput> = {}) {
    const res = await this.scope.inTenant(actor, tenantId, () => this.writeForCurrentTenant(tenantId, { overwrite, extra }));
    await this.scope.audit(actor.id, tenantId, 'console.policies_generated', { overwrite, pages: res.map((r) => `${r.slug}:${r.action}`) });
    return res;
  }

  /** Preview without writing. */
  async preview(actor: AuthActor, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, async () => generatePolicies(await this.input(tenantId, {})));
  }
}
