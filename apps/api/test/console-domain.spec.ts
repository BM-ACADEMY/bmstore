import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppConfig } from '../src/config/app-config';
import { ConsoleScope } from '../src/console/console-scope';
import { DomainService } from '../src/console/domain.service';
import { DnsResolver, TlsProbe, TlsResult } from '../src/console/net-probes';
import { PrismaService } from '../src/prisma/prisma.service';
import { SuperadminTenantsService } from '../src/superadmin/tenants.service';
import { TenantResolver } from '../src/tenancy/tenant-resolver.service';
import { deleteTenants, makeTenant, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

class FakeDns extends DnsResolver {
  cnames = new Map<string, string[]>();
  as = new Map<string, string[]>();
  async cname(h: string) { return this.cnames.get(h) ?? []; }
  async a(h: string) { return this.as.get(h) ?? []; }
}
class FakeTls extends TlsProbe {
  result: TlsResult = { status: 'valid', detail: 'Certificate from Let\'s Encrypt, 89 days left', expiresAt: new Date(Date.now() + 89 * 86_400_000) };
  calls: string[] = [];
  async check(h: string) { this.calls.push(h); return this.result; }
}

describe('console: domain mapping', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const dns = new FakeDns();
  const tlsProbe = new FakeTls();
  const ids: string[] = [];
  const BASE = 'store.bmtechx.in';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DnsResolver).useValue(dns).overrideProvider(TlsProbe).useValue(tlsProbe).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    s = await superadminSession(app);
    dns.as.set(BASE, ['203.0.113.10']);
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('save -> instructions; DNS wrong -> failed and NOT routed; CNAME right -> verified, routed (store answers on its domain), audited', async () => {
    const t = await makeTenant(prisma.base);
    ids.push(t.id);
    const domain = `shop.${uniq('c')}.in`;
    const v = (await s.call('put', `/superadmin/console/stores/${t.id}/domain`).send({ domain: `https://${domain.toUpperCase()}/` }).expect(200)).body;
    expect(v).toMatchObject({ domain, dnsStatus: 'pending', live: false, instructions: { type: 'CNAME', name: domain, value: BASE } });

    // tls-ask asks /health with the client's Host: unknown store until verified => no certificate is requested
    await request(app.getHttpServer()).get('/health').set('Host', domain).expect(404);

    dns.cnames.set(domain, ['elsewhere.example.net']);
    const bad = (await s.call('post', `/superadmin/console/stores/${t.id}/domain/check-dns`).expect(200)).body;
    expect(bad).toMatchObject({ dnsStatus: 'failed', dnsSeen: ['CNAME elsewhere.example.net'], live: false });
    expect((await prisma.base.tenant.findUniqueOrThrow({ where: { id: t.id } })).customDomain).toBeNull();

    dns.cnames.set(domain, [BASE]);
    const ok = (await s.call('post', `/superadmin/console/stores/${t.id}/domain/check-dns`).expect(200)).body;
    expect(ok).toMatchObject({ dnsStatus: 'verified', live: true });
    expect((await prisma.base.tenant.findUniqueOrThrow({ where: { id: t.id } })).customDomain).toBe(domain);
    const h = (await request(app.getHttpServer()).get('/health').set('Host', domain).expect(200)).body;
    expect(h.tenant).toBe(t.slug); // => tls-ask approves, Caddy issues the certificate on first visit

    // SSL locally: skipped, probe not called
    const ssl = (await s.call('post', `/superadmin/console/stores/${t.id}/domain/check-ssl`).expect(200)).body;
    expect(ssl).toMatchObject({ sslStatus: 'skipped', sslDetail: 'SSL check skipped locally' });
    expect(tlsProbe.calls).toEqual([]);

    // DNS later removed by the client => unrouted
    dns.cnames.delete(domain);
    const gone = (await s.call('post', `/superadmin/console/stores/${t.id}/domain/check-dns`).expect(200)).body;
    expect(gone).toMatchObject({ dnsStatus: 'failed', live: false });
    await request(app.getHttpServer()).get('/health').set('Host', domain).expect(404);
    const actions = (await prisma.base.auditLog.findMany({ where: { tenantId: t.id, action: { startsWith: 'console.domain' } } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['console.domain_set', 'console.domain_checked']));
  });

  it('apex domain via A records matching the base domain', async () => {
    const t = await makeTenant(prisma.base);
    ids.push(t.id);
    const domain = `${uniq('apex')}.in`;
    await s.call('put', `/superadmin/console/stores/${t.id}/domain`).send({ domain }).expect(200);
    dns.as.set(domain, ['203.0.113.10']);
    expect((await s.call('post', `/superadmin/console/stores/${t.id}/domain/check-dns`).expect(200)).body.dnsStatus).toBe('verified');
    dns.as.set(domain, ['198.51.100.7']);
    expect((await s.call('post', `/superadmin/console/stores/${t.id}/domain/check-dns`).expect(200)).body.dnsStatus).toBe('failed');
  });

  it('refuses platform sub-domains, another store\'s domain, junk; changing the domain unroutes the old one; delete clears it', async () => {
    const [a, b] = [await makeTenant(prisma.base), await makeTenant(prisma.base)];
    ids.push(a.id, b.id);
    await s.call('put', `/superadmin/console/stores/${a.id}/domain`).send({ domain: `x.${BASE}` }).expect(400);
    await s.call('put', `/superadmin/console/stores/${a.id}/domain`).send({ domain: 'x.localhost' }).expect(400);
    await s.call('put', `/superadmin/console/stores/${a.id}/domain`).send({ domain: 'not a domain' }).expect(400);
    const d1 = `${uniq('one')}.in`;
    await s.call('put', `/superadmin/console/stores/${a.id}/domain`).send({ domain: d1 }).expect(200);
    await s.call('put', `/superadmin/console/stores/${b.id}/domain`).send({ domain: d1 }).expect(409);
    dns.cnames.set(d1, [BASE]);
    await s.call('post', `/superadmin/console/stores/${a.id}/domain/check-dns`).expect(200);
    const d2 = `${uniq('two')}.in`;
    const v = (await s.call('put', `/superadmin/console/stores/${a.id}/domain`).send({ domain: d2 }).expect(200)).body;
    expect(v).toMatchObject({ domain: d2, dnsStatus: 'pending', live: false });
    expect((await prisma.base.tenant.findUniqueOrThrow({ where: { id: a.id } })).customDomain).toBeNull();
    await s.call('delete', `/superadmin/console/stores/${a.id}/domain`).expect(204);
    expect(await s.call('get', `/superadmin/console/stores/${a.id}/domain`).expect(200).then((r) => r.body)).toEqual({});
    await s.call('post', `/superadmin/console/stores/${a.id}/domain/check-dns`).expect(404);
  });

  it('SSL status in production mode uses the TLS probe once DNS is verified', async () => {
    const t = await makeTenant(prisma.base);
    ids.push(t.id);
    const cfg = Object.assign(Object.create(Object.getPrototypeOf(app.get(AppConfig))), app.get(AppConfig), { rootDomain: BASE });
    const svc = new DomainService(prisma, new ConsoleScope(prisma, cfg), cfg, dns, tlsProbe, app.get(TenantResolver), app.get(SuperadminTenantsService));
    const domain = `${uniq('prod')}.co.in`;
    await svc.set(s.actor, t.id, domain);
    expect((await svc.checkSsl(s.actor, t.id)).sslStatus).toBe('unknown'); // DNS first
    dns.cnames.set(domain, [BASE]);
    await svc.checkDns(s.actor, t.id);
    const v = await svc.checkSsl(s.actor, t.id);
    expect(v).toMatchObject({ sslStatus: 'valid' });
    expect(v.sslExpiresAt).toBeTruthy();
    expect(tlsProbe.calls).toContain(domain);
    tlsProbe.result = { status: 'invalid', detail: 'TLS check failed: CERT_HAS_EXPIRED', expiresAt: null };
    expect((await svc.checkSsl(s.actor, t.id)).sslStatus).toBe('invalid');
  });
});
