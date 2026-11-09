/** GST invoice PDFs: access control (customer token / phone, owner), CGST+SGST vs IGST, unregistered stores. */
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { invoiceModel, InvoiceService } from '../src/storefront/invoice.service';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, deleteTenants } from './helpers';
import { checkoutBody, makeStore } from './storefront-helpers';

/** Text of a PDF when poppler is installed (embedded fonts make the raw bytes unsearchable); null otherwise. */
function pdfText(pdf: Buffer): string | null {
  try { const f = join(mkdtempSync(join(tmpdir(), 'inv-')), 'i.pdf'); writeFileSync(f, pdf); return execFileSync('pdftotext', ['-layout', f, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); }
  catch { return null; }
}

describe('invoices', () => {
  let app: INestApplication;
  let S: Awaited<ReturnType<typeof makeStore>>;
  let B: Awaited<ReturnType<typeof makeStore>>;
  beforeAll(async () => {
    app = await createApp();
    S = await makeStore(app);
    B = await makeStore(app, { gstNumber: null });
  });
  afterAll(async () => { await deleteTenants(app.get(PrismaService).base, [S.t.id, B.t.id]); await app.close(); });

  it('customer download by token or phone; wrong token / other phone / other store -> 404; owner download in the admin', async () => {
    const r = (await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }])).expect(201)).body;
    const ok = await S.api().get(`/storefront/orders/${r.orderNo}/invoice?t=${r.token}`).set('Host', S.host).expect(200);
    expect(ok.headers['content-type']).toBe('application/pdf');
    expect(ok.headers['content-disposition']).toContain(`invoice-${r.orderNo}.pdf`);
    expect(ok.body.subarray(0, 5).toString()).toBe('%PDF-');
    await S.api().get(`/storefront/orders/${r.orderNo}/invoice?phone=9876500002`).set('Host', S.host).expect(200);
    await S.api().get(`/storefront/orders/${r.orderNo}/invoice?phone=9876500001`).set('Host', S.host).expect(404);
    await S.api().get(`/storefront/orders/${r.orderNo}/invoice?t=${'x'.repeat(32)}`).set('Host', S.host).expect(404);
    await S.api().get(`/storefront/orders/${r.orderNo}/invoice`).set('Host', S.host).expect(404);
    // the same order number + token on another store's host: nothing
    await B.api().get(`/storefront/orders/${r.orderNo}/invoice?t=${r.token}`).set('Host', B.host).expect(404);
    const owner = await S.login();
    const o = await app.get(PrismaService).base.order.findFirst({ where: { tenantId: S.t.id, orderNo: r.orderNo } });
    await S.api().get(`/store/orders/${o!.id}/invoice`).set('Host', S.host).set('Authorization', `Bearer ${owner}`).expect(200);
    const ownerB = await B.login();
    await B.api().get(`/store/orders/${o!.id}/invoice`).set('Host', B.host).set('Authorization', `Bearer ${ownerB}`).expect(404);
  });

  it('intra-state order splits GST into CGST + SGST; inter-state shows IGST; amounts reconcile', async () => {
    const prisma = app.get(PrismaService);
    const svc = app.get(InvoiceService);
    const tn = (await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876500011' })).expect(201)).body;
    const ka = (await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876500012', address: { ...checkoutBody([]).address, city: 'Bengaluru', state: 'Karnataka', pincode: '560001' } })).expect(201)).body;
    const load = (orderNo: string) => prisma.runAsTenant(S.t.id, async () => {
      // the invoice service reads the tenant from the request context: emulate the middleware
      const t = await prisma.base.tenant.findUniqueOrThrow({ where: { id: S.t.id } });
      const { RequestContext } = await import('../src/common/request-context');
      return RequestContext.run({ requestId: 'inv', tenantId: S.t.id, tenant: { ...t, expiresAt: null } as any }, () => svc.load({ orderNo }));
    });
    const a = invoiceModel(await load(tn.orderNo));
    expect(a).toMatchObject({ title: 'TAX INVOICE', registered: true, interState: false, sellerState: '33', buyerState: '33', igst: 0 });
    expect(a.cgst + a.sgst).toBe(a.lines.reduce((n, l) => n + l.tax, 0));
    expect(a.lines[0]).toMatchObject({ hsn: '5208', qty: 1, rateBp: 500, amount: 99900 });
    expect(a.lines[0].taxable + a.lines[0].tax).toBe(99900);
    const b = invoiceModel(await load(ka.orderNo));
    expect(b).toMatchObject({ title: 'TAX INVOICE', interState: true, buyerState: '29', cgst: 0, sgst: 0 });
    expect(b.igst).toBe(b.lines[0].tax);
    // the PDF itself (text checked when poppler is available locally; CI may lack it)
    const pdf = (await S.api().get(`/storefront/orders/${ka.orderNo}/invoice?t=${ka.token}`).set('Host', S.host).expect(200)).body as Buffer;
    expect(pdf.length).toBeGreaterThan(5000);
    const txt = pdfText(pdf);
    if (txt) { expect(txt).toContain('TAX INVOICE'); expect(txt).toContain('IGST'); expect(txt).toContain('Karnataka'); expect(txt).not.toContain('CGST (included)'); }
    // GST split of the stored tax for the ₹999 (5% inclusive) saree, plus flat shipping ₹79 and COD ₹49
    const o = await prisma.base.order.findFirst({ where: { tenantId: S.t.id, orderNo: tn.orderNo } });
    expect(o!.tax).toBe(99900 - Math.round((99900 * 10000) / 10500));
    expect(o!.total).toBe(99900 + 7900 + 4900);
  });

  it('a store without a GSTIN gets a plain invoice: tax 0, no GST lines', async () => {
    const r = (await B.api().post('/storefront/checkout').set('Host', B.host).send(checkoutBody([{ productId: B.plain.id, qty: 1 }])).expect(201)).body;
    const o = await app.get(PrismaService).base.order.findFirst({ where: { tenantId: B.t.id, orderNo: r.orderNo } });
    expect(o!.tax).toBe(0);
    const pdf = (await B.api().get(`/storefront/orders/${r.orderNo}/invoice?t=${r.token}`).set('Host', B.host).expect(200)).body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const model = invoiceModel({ order: o!, customer: { name: 'x', phone: '9876500002', email: null }, tenant: { ...B.t, expiresAt: null } as any });
    expect(model).toMatchObject({ title: 'INVOICE', registered: false, cgst: 0, sgst: 0, igst: 0 });
    const txt = pdfText(pdf);
    if (txt) { expect(txt).not.toContain('TAX INVOICE'); expect(txt).not.toMatch(/CGST|IGST/); expect(txt).toContain('not registered under GST'); }
  });
});
