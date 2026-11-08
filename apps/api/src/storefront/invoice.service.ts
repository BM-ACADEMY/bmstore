import { Injectable, NotFoundException } from '@nestjs/common';
import type { Order } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RequestContext, TenantInfo } from '../common/request-context';
import { parseItems } from '../orders/order-items';
import { PrismaService } from '../prisma/prisma.service';
import { stateCodeFromGstin, STATES } from './india';
import { splitGst } from './pricing';

/**
 * GST invoice as a PDF, one per order. Prices are GST-inclusive, so each line shows the taxable value (net of tax)
 * and the tax carved out of it; CGST + SGST when the buyer's state matches the seller's GSTIN state, IGST otherwise.
 * A store without a GSTIN gets a plain "Invoice" with no tax lines. Fonts: Noto Sans Tamil (covers Latin, ₹, Tamil).
 */
const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');
const REG = join(FONT_DIR, 'NotoSansTamil-Regular.ttf');
const BOLD = join(FONT_DIR, 'NotoSansTamil-SemiBold.ttf');
const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctOf = (bp: number) => `${(bp / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
const stateName = (code: string | null) => STATES.find((s) => s.code === code)?.name ?? '';

export interface InvoiceData { order: Order; customer: { name: string; phone: string; email: string | null }; tenant: TenantInfo }
/** What the PDF says, as data (tested directly: embedded-font PDFs are not text-searchable). */
export interface InvoiceModel { title: 'TAX INVOICE' | 'INVOICE'; registered: boolean; interState: boolean; sellerState: string | null; buyerState: string | null; cgst: number; sgst: number; igst: number; lines: Array<{ name: string; hsn: string; qty: number; taxable: number; tax: number; rateBp: number; amount: number }> }

export function invoiceModel(data: InvoiceData): InvoiceModel {
  const { order, tenant } = data;
  const addr = (order.address as any) ?? {};
  const sellerState = stateCodeFromGstin(tenant.gstNumber);
  const buyerState = typeof addr.stateCode === 'string' ? addr.stateCode : null;
  const registered = Boolean(tenant.gstNumber);
  const gst = splitGst(order.tax, sellerState, buyerState);
  return {
    title: registered ? 'TAX INVOICE' : 'INVOICE', registered, interState: gst.interState, sellerState, buyerState, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst,
    lines: parseItems(order.items).map((it) => ({ name: `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ''}`, hsn: it.hsnCode ?? '-', qty: it.qty, taxable: it.total - (it.tax ?? 0), tax: it.tax ?? 0, rateBp: it.gstRateBp ?? 0, amount: it.total })),
  };
}

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads an order of the current tenant for its invoice (owner route: by id; customer route: by order number). */
  async load(where: { id?: string; orderNo?: string }): Promise<InvoiceData> {
    const t = RequestContext.get()?.tenant;
    if (!t) throw new NotFoundException('Store not found');
    const order = await this.prisma.db.order.findFirst({ where: where.id ? { id: where.id } : { orderNo: where.orderNo!.trim().toUpperCase() }, include: { customer: { select: { name: true, phone: true, email: true } } } });
    if (!order) throw new NotFoundException('Order not found');
    const { customer, ...o } = order;
    return { order: o as Order, customer, tenant: t };
  }

  /** Renders the PDF into a Buffer (invoices are small: a page or two). */
  render(data: InvoiceData): Promise<Buffer> {
    const { order, customer, tenant } = data;
    const items = parseItems(order.items);
    const addr = (order.address as any) ?? {};
    const sellerState = stateCodeFromGstin(tenant.gstNumber);
    const buyerState = typeof addr.stateCode === 'string' ? addr.stateCode : null;
    const registered = Boolean(tenant.gstNumber);
    const gst = splitGst(order.tax, sellerState, buyerState);
    const hasFonts = existsSync(REG) && existsSync(BOLD);

    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${order.orderNo}`, Author: tenant.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
    if (hasFonts) { doc.registerFont('reg', REG); doc.registerFont('bold', BOLD); }
    const reg = () => doc.font(hasFonts ? 'reg' : 'Helvetica');
    const bold = () => doc.font(hasFonts ? 'bold' : 'Helvetica-Bold');
    const W = doc.page.width - 80;
    const L = 40;

    // header
    bold().fontSize(18).text(tenant.name, L, 40, { width: W * 0.6 });
    reg().fontSize(9).fillColor('#444');
    if (tenant.address) doc.text(tenant.address, { width: W * 0.6 });
    if (tenant.supportPhone) doc.text(`Phone: ${tenant.supportPhone}`);
    if (tenant.gstNumber) doc.text(`GSTIN: ${tenant.gstNumber}${sellerState ? `  ·  ${stateName(sellerState)} (${sellerState})` : ''}`);
    const headerBottom = doc.y;
    doc.fillColor('#000');
    bold().fontSize(16).text(registered ? 'TAX INVOICE' : 'INVOICE', L + W * 0.62, 40, { width: W * 0.38, align: 'right' });
    reg().fontSize(9).fillColor('#444');
    doc.text(`Invoice no: ${order.orderNo}`, L + W * 0.62, doc.y + 4, { width: W * 0.38, align: 'right' });
    doc.text(`Date: ${order.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`, { width: W * 0.38, align: 'right' });
    doc.text(`Payment: ${order.paymentMode === 'COD' ? 'Cash on delivery' : 'Online'} · ${order.paymentStatus === 'PAID' ? 'Paid' : order.paymentStatus === 'PENDING' ? 'Payment due' : order.paymentStatus.toLowerCase().replace('_', ' ')}`, { width: W * 0.38, align: 'right' });
    doc.fillColor('#000');
    let y = Math.max(headerBottom, doc.y) + 16;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.8).strokeColor('#999').stroke();
    y += 12;

    // bill to / ship to
    bold().fontSize(10).text('Bill to / Ship to', L, y);
    reg().fontSize(9.5);
    doc.text(customer.name, L, doc.y + 2);
    doc.text([addr.line1, addr.line2].filter(Boolean).join(', '), { width: W * 0.55 });
    doc.text([addr.city, addr.state, addr.pincode].filter(Boolean).join(', '));
    doc.text(`Phone: ${customer.phone}${customer.email ? `  ·  ${customer.email}` : ''}`);
    if (registered) doc.text(`Place of supply: ${stateName(buyerState) || addr.state || '-'}${buyerState ? ` (${buyerState})` : ''}  ·  ${gst.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}`);
    y = doc.y + 14;

    // table
    const cols = registered
      ? [{ k: 'item', w: 0.34, h: 'Item', a: 'left' }, { k: 'hsn', w: 0.08, h: 'HSN', a: 'left' }, { k: 'qty', w: 0.06, h: 'Qty', a: 'right' }, { k: 'rate', w: 0.12, h: 'Rate (incl.)', a: 'right' }, { k: 'taxable', w: 0.13, h: 'Taxable', a: 'right' }, { k: 'gst', w: 0.13, h: gst.interState ? 'IGST' : 'CGST+SGST', a: 'right' }, { k: 'amount', w: 0.14, h: 'Amount', a: 'right' }]
      : [{ k: 'item', w: 0.5, h: 'Item', a: 'left' }, { k: 'hsn', w: 0.12, h: 'HSN', a: 'left' }, { k: 'qty', w: 0.08, h: 'Qty', a: 'right' }, { k: 'rate', w: 0.15, h: 'Rate', a: 'right' }, { k: 'amount', w: 0.15, h: 'Amount', a: 'right' }];
    const xs: number[] = []; let acc = L;
    for (const c of cols) { xs.push(acc); acc += c.w * W; }
    const row = (cells: Record<string, string>, isHead = false) => {
      if (y > doc.page.height - 120) { doc.addPage(); y = 40; }
      (isHead ? bold() : reg()).fontSize(isHead ? 8.5 : 9);
      let h = 0;
      cols.forEach((c, i) => { h = Math.max(h, doc.heightOfString(cells[c.k] ?? '', { width: c.w * W - 6 })); });
      if (isHead) doc.rect(L, y - 3, W, h + 8).fill('#f1ece2').fillColor('#000');
      cols.forEach((c, i) => doc.text(cells[c.k] ?? '', xs[i] + 3, y, { width: c.w * W - 6, align: c.a as any }));
      y += h + 7;
      doc.moveTo(L, y - 3).lineTo(L + W, y - 3).lineWidth(0.3).strokeColor('#ddd').stroke();
    };
    row(Object.fromEntries(cols.map((c) => [c.k, c.h])), true);
    for (const it of items) {
      const tax = it.tax ?? 0;
      const taxable = it.total - tax;
      const name = `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ''}${it.sku ? `\nSKU ${it.sku}` : ''}`;
      row({ item: name, hsn: it.hsnCode ?? '-', qty: String(it.qty), rate: rupees(it.unitPrice), taxable: rupees(taxable), gst: `${rupees(tax)}\n@ ${pctOf(it.gstRateBp ?? 0)}`, amount: rupees(it.total) });
    }
    y += 6;

    // totals
    const tot = (label: string, value: string, strong = false) => {
      (strong ? bold() : reg()).fontSize(strong ? 11 : 9.5);
      doc.text(label, L + W * 0.55, y, { width: W * 0.25, align: 'right' });
      doc.text(value, L + W * 0.8, y, { width: W * 0.2, align: 'right' });
      y += strong ? 18 : 14;
    };
    tot('Subtotal (incl. tax)', rupees(order.subtotal));
    if (order.discount) tot(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `− ${rupees(order.discount)}`);
    tot('Delivery', order.shipping ? rupees(order.shipping) : 'Free');
    if (order.codCharge) tot('COD charge', rupees(order.codCharge));
    if (registered) {
      if (gst.interState) tot('IGST (included)', rupees(gst.igst));
      else { tot('CGST (included)', rupees(gst.cgst)); tot('SGST (included)', rupees(gst.sgst)); }
    }
    doc.moveTo(L + W * 0.55, y).lineTo(L + W, y).lineWidth(0.8).strokeColor('#999').stroke();
    y += 6;
    tot('Grand total', rupees(order.total), true);
    if (order.paymentMode === 'COD' && order.paymentStatus !== 'PAID') tot('Amount to collect', rupees(order.total));

    // footer
    y += 14;
    reg().fontSize(8.5).fillColor('#555');
    doc.text(registered ? 'Prices are inclusive of GST. Tax shown is the GST portion of the amounts charged. This is a computer-generated invoice and needs no signature.' : 'This store is not registered under GST; no tax is charged on this invoice. This is a computer-generated invoice and needs no signature.', L, y, { width: W });
    if (addr.phoneVerified) doc.text('Customer phone verified by OTP at checkout.', { width: W });
    doc.end();
    return done;
  }
}
