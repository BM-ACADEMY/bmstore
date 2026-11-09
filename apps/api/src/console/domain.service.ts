import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StoreDomain } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { AuthActor } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { SuperadminTenantsService } from '../superadmin/tenants.service';
import { TenantResolver } from '../tenancy/tenant-resolver.service';
import { ConsoleScope } from './console-scope';
import { DnsResolver, TlsProbe } from './net-probes';

const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export interface DomainView {
  domain: string;
  dnsStatus: string;
  dnsSeen: string[];
  dnsCheckedAt: Date | null;
  verifiedAt: Date | null;
  sslStatus: string;
  sslDetail: string | null;
  sslExpiresAt: Date | null;
  sslCheckedAt: Date | null;
  live: boolean; // routing + on-demand TLS active (tenants.custom_domain set)
  instructions: { type: 'CNAME'; name: string; value: string; note: string };
}

/**
 * Client domain mapping:
 *  1. developer saves the domain (pending) and sends the client the DNS instruction (CNAME -> PLATFORM_BASE_DOMAIN);
 *  2. "Check DNS": CNAME must point at PLATFORM_BASE_DOMAIN (apex domains: A records must match its A records);
 *  3. verified => tenants.custom_domain is set. Caddy's on-demand TLS asks tls-ask, which asks the API /health with
 *     that Host: only now does it answer 200, so the certificate is issued on the first HTTPS visit;
 *  4. "Check SSL" connects with SNI and records the certificate (skipped locally).
 */
@Injectable()
export class DomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ConsoleScope,
    private readonly cfg: AppConfig,
    private readonly dns: DnsResolver,
    private readonly tlsProbe: TlsProbe,
    private readonly resolver: TenantResolver,
    private readonly tenants: SuperadminTenantsService,
  ) {}
  private get db() { return this.prisma.db; }

  private view(d: StoreDomain, customDomain: string | null): DomainView {
    return {
      domain: d.domain, dnsStatus: d.dnsStatus, dnsSeen: d.dnsSeen, dnsCheckedAt: d.dnsCheckedAt, verifiedAt: d.verifiedAt,
      sslStatus: d.sslStatus, sslDetail: d.sslDetail, sslExpiresAt: d.sslExpiresAt, sslCheckedAt: d.sslCheckedAt,
      live: customDomain === d.domain,
      instructions: {
        type: 'CNAME', name: d.domain, value: this.cfg.platformBaseDomain,
        note: `Ask the client to add a CNAME record for ${d.domain} pointing to ${this.cfg.platformBaseDomain}. For a bare domain (no www), use their DNS provider's ALIAS/ANAME, or A records with the same IPs as ${this.cfg.platformBaseDomain}.`,
      },
    };
  }

  private normalize(raw: string): string {
    const d = String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
    if (!DOMAIN.test(d)) throw new BadRequestException('Domain must look like shop.example.com');
    for (const own of [this.cfg.platformBaseDomain, this.cfg.rootDomain]) {
      if (d === own || d.endsWith('.' + own)) throw new BadRequestException(`Use the client's own domain, not one under ${own}`);
    }
    return d;
  }

  async get(actor: AuthActor | null, tenantId: string): Promise<DomainView | null> {
    return this.scope.inTenant(actor, tenantId, async () => {
      const d = await this.db.storeDomain.findUnique({ where: { tenantId } });
      if (!d) return null;
      const t = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { customDomain: true } });
      return this.view(d, t.customDomain);
    });
  }

  /** Save (or change) the domain. Changing it takes the old one off routing straight away. */
  async set(actor: AuthActor, tenantId: string, raw: string): Promise<DomainView> {
    const domain = this.normalize(raw);
    const clash = await this.scope.platform(actor, 'domain-clash', async () => ({
      tenant: await this.db.tenant.findFirst({ where: { customDomain: domain, id: { not: tenantId } }, select: { id: true } }),
      mapping: await this.db.storeDomain.findFirst({ where: { domain, tenantId: { not: tenantId } }, select: { tenantId: true } }),
    }));
    if (clash.tenant || clash.mapping) throw new ConflictException('That domain is already mapped to another store');
    const cur = await this.scope.inTenant(actor, tenantId, () => this.db.storeDomain.findUnique({ where: { tenantId } }));
    if (cur && cur.domain !== domain) await this.unroute(actor, tenantId, 'domain changed');
    try {
      await this.scope.asTenant(tenantId, () =>
        cur
          ? this.db.storeDomain.update({ where: { tenantId }, data: cur.domain === domain ? {} : { domain, dnsStatus: 'pending', dnsSeen: [], dnsCheckedAt: null, verifiedAt: null, sslStatus: 'unknown', sslDetail: null, sslExpiresAt: null, sslCheckedAt: null } })
          : this.db.storeDomain.create({ data: { tenantId, domain } }),
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That domain is already mapped to another store');
      throw e;
    }
    await this.scope.audit(actor.id, tenantId, 'console.domain_set', { domain });
    return (await this.get(actor, tenantId))!;
  }

  /** Remove the mapping entirely. */
  async remove(actor: AuthActor, tenantId: string) {
    await this.unroute(actor, tenantId, 'domain removed');
    await this.scope.inTenant(actor, tenantId, () => this.db.storeDomain.deleteMany({}));
    await this.scope.audit(actor.id, tenantId, 'console.domain_removed', {});
  }

  private async setCustomDomain(actor: AuthActor | null, tenantId: string, customDomain: string | null, reason: string) {
    const run = async () => {
      const before = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      if (before.customDomain === customDomain) return null;
      const after = await this.db.tenant.update({ where: { id: tenantId }, data: { customDomain } });
      return { before, after };
    };
    const r = actor ? await this.scope.platform(actor, 'set-custom-domain', run) : await this.scope.system('set-custom-domain', run);
    if (!r) return;
    await this.resolver.invalidate(r.before, r.after);
    if (actor) await this.tenants.record(actor, 'tenant.custom_domain_set', tenantId, { customDomain, reason });
  }
  private unroute(actor: AuthActor | null, tenantId: string, reason: string) {
    return this.setCustomDomain(actor, tenantId, null, reason);
  }

  /** Does the domain point at us? CNAME to the base domain, or (apex) the same A records. */
  async dnsPointsHere(domain: string): Promise<{ ok: boolean; seen: string[] }> {
    const target = this.cfg.platformBaseDomain;
    const cnames = await this.dns.cname(domain);
    if (cnames.length) return { ok: cnames.some((c) => c === target), seen: cnames.map((c) => `CNAME ${c}`) };
    const [mine, ours] = await Promise.all([this.dns.a(domain), this.dns.a(target)]);
    const ok = mine.length > 0 && ours.length > 0 && mine.every((ip) => ours.includes(ip));
    return { ok, seen: mine.map((ip) => `A ${ip}`) };
  }

  /** Check DNS now. Verified => routed (custom_domain set, on-demand TLS allowed). No longer pointing => unrouted. */
  async checkDns(actor: AuthActor | null, tenantId: string): Promise<DomainView> {
    const d = await this.scope.inTenant(actor, tenantId, () => this.db.storeDomain.findUnique({ where: { tenantId } }));
    if (!d) throw new NotFoundException('No domain saved for this store');
    const { ok, seen } = await this.dnsPointsHere(d.domain);
    const now = new Date();
    await this.scope.asTenant(tenantId, () =>
      this.db.storeDomain.update({ where: { tenantId }, data: { dnsStatus: ok ? 'verified' : 'failed', dnsSeen: seen, dnsCheckedAt: now, verifiedAt: ok ? d.verifiedAt ?? now : d.verifiedAt } }),
    );
    if (ok) await this.setCustomDomain(actor, tenantId, d.domain, 'dns verified');
    else if (d.dnsStatus === 'verified') await this.unroute(actor, tenantId, 'dns no longer points here');
    if (actor) await this.scope.audit(actor.id, tenantId, 'console.domain_checked', { domain: d.domain, ok });
    return (await this.get(actor, tenantId))!;
  }

  /** Local development cannot get a public certificate: report "skipped" rather than a false failure. */
  isLocal(host: string) {
    return this.cfg.rootDomain === 'localhost' || /\.(localhost|test|local|example)$/.test(host) || host === 'localhost';
  }

  async checkSsl(actor: AuthActor | null, tenantId: string): Promise<DomainView> {
    const d = await this.scope.inTenant(actor, tenantId, () => this.db.storeDomain.findUnique({ where: { tenantId } }));
    if (!d) throw new NotFoundException('No domain saved for this store');
    const now = new Date();
    let data: Prisma.StoreDomainUpdateInput;
    if (this.isLocal(d.domain)) data = { sslStatus: 'skipped', sslDetail: 'SSL check skipped locally', sslCheckedAt: now };
    else if (d.dnsStatus !== 'verified') data = { sslStatus: 'unknown', sslDetail: 'Verify DNS first: the certificate is issued after the domain points here', sslCheckedAt: now };
    else {
      const r = await this.tlsProbe.check(d.domain);
      data = { sslStatus: r.status, sslDetail: r.detail, sslExpiresAt: r.expiresAt, sslCheckedAt: now };
    }
    await this.scope.asTenant(tenantId, () => this.db.storeDomain.update({ where: { tenantId }, data }));
    return (await this.get(actor, tenantId))!;
  }
}
