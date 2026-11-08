import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RefundCase } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { AuthActor } from '../common/request-context';
import { istDay } from '../common/working-days';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';
import { rupees } from './policies';
import { RefundGateway } from './refund-gateway';
import { evaluateRefund, REFUND_REASONS, RefundDecision, RefundReason, refundProcessBy } from './refund-rule';

export interface OpenRefundInput {
  reason: RefundReason;
  note?: string;
  clientDelayWorkingDays?: number;
  clientDelayNote?: string;
  amountPaidPaise: number;
  gstPaise: number;
  paymentId?: string;
  invoiceRef?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Indian financial year label for a date (April-March), e.g. 2026-27. */
export function financialYear(d: Date): string {
  const [y, m] = istDay(d).split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/**
 * Refund helper: opens a case with the facts, applies the rule (refund-rule.ts) and shows why; a human approves;
 * approval re-checks the rule, calls the refund gateway (Razorpay test mode) and issues a credit note.
 */
@Injectable()
export class RefundService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ConsoleScope, private readonly gateway: RefundGateway, private readonly cfg: AppConfig) {}
  private get db() { return this.prisma.db; }

  /** Facts from the store itself; must run inside the tenant scope. */
  private async facts(tenantId: string, input: Pick<RefundCase, 'reason' | 'clientDelayWorkingDays' | 'amountPaidPaise' | 'gstPaise'>, at: Date) {
    const t = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { wentLiveAt: true } });
    const intake = await this.db.storeIntake.findUnique({ where: { tenantId }, select: { completedAt: true } });
    return evaluateRefund({
      intakeCompletedAt: intake?.completedAt ?? null, wentLiveAt: t.wentLiveAt, requestedAt: at, clientDelayWorkingDays: input.clientDelayWorkingDays,
      reason: input.reason as RefundReason, amountPaidPaise: input.amountPaidPaise, gstPaise: input.gstPaise,
    }, this.cfg.holidays);
  }

  private validate(i: OpenRefundInput) {
    if (!REFUND_REASONS.includes(i.reason)) throw new BadRequestException(`Reason must be one of ${REFUND_REASONS.join(', ')}`);
    if (!Number.isInteger(i.amountPaidPaise) || i.amountPaidPaise <= 0) throw new BadRequestException('Amount paid must be a whole number of paise');
    if (!Number.isInteger(i.gstPaise) || i.gstPaise < 0 || i.gstPaise >= i.amountPaidPaise) throw new BadRequestException('GST must be whole paise and less than the amount paid');
    if (i.paymentId && !/^pay_[A-Za-z0-9]+$/.test(i.paymentId)) throw new BadRequestException('Payment id must look like pay_XXXXXXXX');
  }

  /** Dry run: what would the rule say for these facts? Nothing is stored. */
  async preview(actor: AuthActor, tenantId: string, input: OpenRefundInput): Promise<RefundDecision> {
    this.validate(input);
    return this.scope.inTenant(actor, tenantId, () => this.facts(tenantId, { reason: input.reason, clientDelayWorkingDays: input.clientDelayWorkingDays ?? 0, amountPaidPaise: input.amountPaidPaise, gstPaise: input.gstPaise }, new Date()));
  }

  async open(actor: AuthActor, tenantId: string, input: OpenRefundInput) {
    this.validate(input);
    const row = await this.scope.inTenant(actor, tenantId, async () => {
      const caseFacts = { reason: input.reason, clientDelayWorkingDays: input.clientDelayWorkingDays ?? 0, amountPaidPaise: input.amountPaidPaise, gstPaise: input.gstPaise };
      const decision = await this.facts(tenantId, caseFacts, new Date());
      return this.db.refundCase.create({
        data: {
          tenantId, ...caseFacts, note: input.note, clientDelayNote: input.clientDelayNote, paymentId: input.paymentId, invoiceRef: input.invoiceRef,
          eligible: decision.eligible, decision: decision as unknown as Prisma.InputJsonValue, createdBy: actor.id,
        },
      });
    });
    await this.scope.audit(actor.id, tenantId, 'console.refund_opened', { caseId: row.id, eligible: row.eligible, rule: (row.decision as any).rule });
    return row;
  }

  list(actor: AuthActor, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, () => this.db.refundCase.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  /** Every case, all stores (refund queue). */
  async all(actor: AuthActor) {
    const rows = await this.scope.platform(actor, 'refund-queue', () =>
      this.db.refundCase.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { tenant: { select: { id: true, name: true, subdomain: true } } } }),
    );
    return rows;
  }

  private async getCase(actor: AuthActor, tenantId: string, caseId: string) {
    const c = await this.scope.inTenant(actor, tenantId, () => this.db.refundCase.findUnique({ where: { id: caseId } }));
    if (!c) throw new NotFoundException('Refund case not found');
    return c;
  }

  /**
   * Human approval. The rule is re-applied with today's facts (a store that went live in the meantime is no longer
   * "not delivered"); only an eligible case can be approved. Then: refund via the gateway, credit note.
   */
  async approve(actor: AuthActor, tenantId: string, caseId: string, confirmPaise: number) {
    const c = await this.getCase(actor, tenantId, caseId);
    if (c.status !== 'open' && c.status !== 'failed') throw new ConflictException(`This case is already ${c.status}`);
    if (!c.paymentId) throw new BadRequestException('Add the Razorpay payment id of the client\'s payment before approving');
    const decision = await this.scope.asTenant(tenantId, () => this.facts(tenantId, c, c.createdAt));
    if (!decision.eligible) {
      await this.scope.asTenant(tenantId, () => this.db.refundCase.update({ where: { id: c.id }, data: { eligible: false, decision: decision as unknown as Prisma.InputJsonValue } }));
      throw new BadRequestException(`Not eligible under the refund policy: ${decision.explanation.join(' ')}`);
    }
    // The human types the amount they see: guards against approving the wrong case.
    if (confirmPaise !== decision.refundPaise) throw new BadRequestException(`Confirm the refund amount: ${rupees(decision.refundPaise)} (${decision.refundPaise} paise)`);

    // Claim the case first so a double click cannot refund twice.
    const now = new Date();
    const claimed = await this.scope.asTenant(tenantId, () =>
      this.db.refundCase.updateMany({ where: { id: c.id, status: { in: ['open', 'failed'] } }, data: { status: 'processing', approvedBy: actor.id, approvedAt: now, processBy: refundProcessBy(now, this.cfg.holidays) } }),
    );
    if (claimed.count !== 1) throw new ConflictException('This case is being processed already');
    await this.scope.audit(actor.id, tenantId, 'console.refund_approved', { caseId: c.id, refundPaise: decision.refundPaise });

    const res = await this.gateway.refund(c.paymentId, decision.refundPaise, { case: c.id, reason: 'store not delivered within 7 working days' });
    if (!res.ok) {
      const failed = await this.scope.asTenant(tenantId, () => this.db.refundCase.update({ where: { id: c.id }, data: { status: 'failed', refundError: res.error ?? 'refund failed' } }));
      await this.scope.audit(actor.id, tenantId, 'console.refund_failed', { caseId: c.id, error: res.error ?? null });
      return failed;
    }
    const creditNote = await this.creditNote(tenantId, c, decision, now);
    const done = await this.issueWithNumber(tenantId, c.id, creditNote, res.refundId!, res.stub);
    await this.scope.audit(actor.id, tenantId, 'console.refund_processed', { caseId: c.id, refundId: res.refundId, stub: res.stub, creditNoteNo: done.creditNoteNo });
    return done;
  }

  async reject(actor: AuthActor, tenantId: string, caseId: string, note: string) {
    const c = await this.getCase(actor, tenantId, caseId);
    if (c.status !== 'open' && c.status !== 'failed') throw new ConflictException(`This case is already ${c.status}`);
    const r = await this.scope.asTenant(tenantId, () => this.db.refundCase.update({ where: { id: c.id }, data: { status: 'rejected', note: [c.note, `Rejected: ${note}`].filter(Boolean).join('\n') } }));
    await this.scope.audit(actor.id, tenantId, 'console.refund_rejected', { caseId: c.id });
    return r;
  }

  private async creditNote(tenantId: string, c: RefundCase, decision: RefundDecision, at: Date) {
    const t = await this.scope.asTenant(tenantId, () => this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } }));
    return {
      date: at.toISOString(),
      seller: { name: this.cfg.platformLegalName, gstin: this.cfg.platformGstin ?? null, address: this.cfg.platformAddress ?? null },
      buyer: { name: t.name, gstin: t.gstNumber, address: t.address },
      against: { invoiceRef: c.invoiceRef, paymentId: c.paymentId },
      reason: 'Refund under the store-delivery guarantee: store not live within 7 working days of a completed intake.',
      taxablePaise: decision.refundPaise - decision.gstPaise,
      gstPaise: decision.gstPaise,
      totalPaise: decision.refundPaise,
    };
  }

  /** CN/<FY>/<0001>: sequential per financial year across the platform; the unique index settles races. */
  private async issueWithNumber(tenantId: string, caseId: string, note: object, refundId: string, stub: boolean) {
    const fy = financialYear(new Date());
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.scope.system('credit-note-seq', () => this.db.refundCase.findFirst({ where: { creditNoteNo: { startsWith: `CN/${fy}/` } }, orderBy: { creditNoteNo: 'desc' }, select: { creditNoteNo: true } }));
      const n = last?.creditNoteNo ? Number(last.creditNoteNo.split('/').pop()) + 1 : 1;
      const no = `CN/${fy}/${String(n).padStart(4, '0')}`;
      try {
        return await this.scope.asTenant(tenantId, () =>
          this.db.refundCase.update({ where: { id: caseId }, data: { status: 'refunded', refundId, refundStub: stub, refundError: null, creditNoteNo: no, creditNote: { number: no, ...note } as Prisma.InputJsonValue } }),
        );
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('Could not allocate a credit note number; try again');
  }

  /** Printable credit note (browser "Save as PDF"). */
  async creditNoteHtml(actor: AuthActor, tenantId: string, caseId: string): Promise<string> {
    const c = await this.getCase(actor, tenantId, caseId);
    if (!c.creditNote) throw new NotFoundException('No credit note for this case yet');
    const n: any = c.creditNote;
    const row = (k: string, v: unknown) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Credit note ${esc(n.number)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}th{width:40%;color:#555;font-weight:500}.total td{font-weight:700}</style></head><body>
<h1>Credit note ${esc(n.number)}</h1><p>Date: ${esc(new Date(n.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }))}</p>
<table>${row('Issued by', n.seller.name)}${row('GSTIN', n.seller.gstin)}${row('Address', n.seller.address)}</table>
<table>${row('Issued to', n.buyer.name)}${row('GSTIN', n.buyer.gstin)}${row('Address', n.buyer.address)}</table>
<table>${row('Against invoice', n.against.invoiceRef)}${row('Payment', n.against.paymentId)}${row('Reason', n.reason)}</table>
<table>${row('Taxable value', rupees(n.taxablePaise))}${row('GST', rupees(n.gstPaise))}<tr class="total"><th>Total credited</th><td>${esc(rupees(n.totalPaise))}</td></tr></table>
${c.refundStub ? '<p><strong>Test document:</strong> the refund was simulated (no Razorpay keys configured).</p>' : `<p>Refund reference: ${esc(c.refundId)}</p>`}
</body></html>`;
  }
}
