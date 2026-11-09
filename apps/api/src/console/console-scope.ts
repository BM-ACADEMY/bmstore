import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { AuthActor, RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** What the console may show about a tenant: never the razorpay_* columns, not even encrypted. */
export type SafeTenant = Omit<Tenant, 'razorpayKeyEnc' | 'razorpaySecretEnc'> & { razorpayConfigured: boolean };
export function safeTenant(t: Tenant): SafeTenant {
  const { razorpayKeyEnc, razorpaySecretEnc, ...rest } = t;
  return { ...rest, razorpayConfigured: Boolean(razorpayKeyEnc && razorpaySecretEnc) };
}

/**
 * How the developer console touches a store. Two doors, both audited:
 *  - `inTenant(actor, id, fn)`: work INSIDE one store runs in that tenant's scope (Prisma extension + RLS pinned to it),
 *    exactly like the store's own admin would. The console reuses the store services (import, media, pages, theme)
 *    through this door, so it cannot reach another tenant's rows by mistake.
 *  - `platform(actor, reason, fn)`: cross-store reads (lists, the needs-attention screen) go through the audited
 *    superadmin bypass. Jobs use `system(reason, fn)`.
 */
@Injectable()
export class ConsoleScope {
  constructor(private readonly prisma: PrismaService, private readonly cfg: AppConfig) {}

  platform<T>(actor: AuthActor, reason: string, fn: () => Promise<T>): Promise<T> {
    return this.prisma.asSuperadmin(actor, `console:${reason}`, fn);
  }

  system<T>(reason: string, fn: () => Promise<T>): Promise<T> {
    return this.prisma.asSystem(`jobs:${reason}`, fn);
  }

  async tenant(actor: AuthActor | null, id: string): Promise<Tenant> {
    const run = () => this.prisma.db.tenant.findUnique({ where: { id } });
    const t = actor ? await this.platform(actor, 'get-tenant', run) : await this.system('get-tenant', run);
    if (!t) throw new NotFoundException('Store not found');
    return t;
  }

  /** Run `fn` scoped to one store. The id comes from the URL, so the store's existence is checked first. */
  async inTenant<T>(actor: AuthActor | null, tenantId: string, fn: () => Promise<T>): Promise<T> {
    await this.tenant(actor, tenantId);
    return this.asTenant(tenantId, fn, actor ?? undefined);
  }

  /** Tenant scope without the existence check (trusted ids from our own queries, e.g. jobs). */
  asTenant<T>(tenantId: string, fn: () => Promise<T>, actor?: AuthActor): Promise<T> {
    const cur = RequestContext.get();
    return RequestContext.run({ requestId: cur?.requestId ?? randomUUID(), tenantId, actor: actor ?? cur?.actor }, async () => await fn());
  }

  /** Semantic audit row inside the store's scope (actor + action + safe meta; never secrets). */
  audit(actorId: string | null, tenantId: string, action: string, meta: Record<string, unknown> = {}) {
    return this.asTenant(tenantId, () => this.prisma.db.auditLog.create({ data: { actorId, action, meta: meta as Prisma.InputJsonValue } }));
  }

  storeHost(t: Pick<Tenant, 'subdomain'>): string {
    return `${t.subdomain}.${this.cfg.rootDomain}`;
  }
  /** Public URL: the client's own domain once mapped (always https), else the platform subdomain. */
  storeUrl(t: Pick<Tenant, 'subdomain' | 'customDomain'>): string {
    if (t.customDomain) return `https://${t.customDomain}`;
    return this.cfg.storeUrlTemplate.replace('{host}', this.storeHost(t));
  }
  adminUrl(t: Pick<Tenant, 'subdomain'>): string {
    return this.cfg.adminUrlTemplate.replace('{host}', this.storeHost(t));
  }
}
