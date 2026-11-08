import { addWorkingDays } from '../common/working-days';
import { DELIVERY_GUARANTEE, rupees } from './policies';
import { deliveryDeadline } from './stage';

/**
 * THE REFUND RULE (store-delivery guarantee, as published on every store's Refund page; see policies.ts):
 *   If we fail to deliver the store (not live within 7 working days of a completed intake, our fault), the client gets
 *   a full refund including GST with a credit note, processed within 7 working days.
 *   Not covered: client-side delays (late details, Razorpay KYC) and change of mind after go-live.
 *
 * Pure function: same facts, same verdict. The console shows the explanation, a human approves, then money moves.
 */
export type RefundReason = 'not_delivered' | 'change_of_mind' | 'other';
export const REFUND_REASONS: RefundReason[] = ['not_delivered', 'change_of_mind', 'other'];

export interface RefundFacts {
  intakeCompletedAt: Date | null;
  wentLiveAt: Date | null;
  /** When the client asked (or "now" when re-evaluated at approval). */
  requestedAt: Date;
  /** Working days of documented client-side delay (late details, Razorpay KYC). They extend the deadline. */
  clientDelayWorkingDays: number;
  reason: RefundReason;
  amountPaidPaise: number;
  gstPaise: number;
}

export type RefundRuleId = 'intake_incomplete' | 'within_window' | 'delivered_on_time' | 'change_of_mind_after_go_live' | 'late_delivery' | 'not_delivered';

export interface RefundDecision {
  eligible: boolean;
  rule: RefundRuleId;
  explanation: string[];
  deadline: string | null;
  refundPaise: number;
  gstPaise: number;
}

const d = (x: Date) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function evaluateRefund(f: RefundFacts, holidays: ReadonlySet<string> = new Set()): RefundDecision {
  if (!Number.isInteger(f.amountPaidPaise) || f.amountPaidPaise <= 0) throw new Error('amountPaidPaise must be a positive whole number of paise');
  if (!Number.isInteger(f.gstPaise) || f.gstPaise < 0 || f.gstPaise >= f.amountPaidPaise) throw new Error('gstPaise must be whole paise, less than the amount paid');
  const delay = Math.max(0, Math.floor(f.clientDelayWorkingDays || 0));
  const no = (rule: RefundRuleId, explanation: string[], deadline: Date | null): RefundDecision => ({ eligible: false, rule, explanation, deadline: deadline?.toISOString() ?? null, refundPaise: 0, gstPaise: 0 });

  if (!f.intakeCompletedAt) {
    return no('intake_incomplete', [
      'The intake is not complete, so the 7-working-day delivery clock has not started.',
      'Delays from late client details are not covered by the guarantee.',
    ], null);
  }
  const deadline = deliveryDeadline(f.intakeCompletedAt, holidays, delay)!;
  const steps = [
    `Intake completed ${d(f.intakeCompletedAt)}.`,
    `Deadline: ${DELIVERY_GUARANTEE.workingDays} working days${delay ? ` + ${delay} working day${delay === 1 ? '' : 's'} of client-side delay` : ''} = ${d(deadline)}.`,
  ];
  if (f.wentLiveAt && f.wentLiveAt.getTime() <= deadline.getTime()) {
    return no('delivered_on_time', [...steps, `Store went live ${d(f.wentLiveAt)}, on time.`, 'Change of mind after go-live is not covered.'], deadline);
  }
  if (f.wentLiveAt && f.reason === 'change_of_mind') {
    return no('change_of_mind_after_go_live', [...steps, `Store went live ${d(f.wentLiveAt)}, after the deadline,`, 'but the request is a change of mind after go-live, which is not covered.'], deadline);
  }
  if (!f.wentLiveAt && f.requestedAt.getTime() <= deadline.getTime()) {
    return no('within_window', [...steps, `Not live yet, but still inside the delivery window (as of ${d(f.requestedAt)}).`], deadline);
  }
  const full = f.amountPaidPaise;
  return {
    eligible: true,
    rule: f.wentLiveAt ? 'late_delivery' : 'not_delivered',
    explanation: [
      ...steps,
      f.wentLiveAt ? `Store went live ${d(f.wentLiveAt)}, after the deadline.` : 'Store was not live by the deadline.',
      `Full refund including GST: ${rupees(full)} (GST ${rupees(f.gstPaise)}), with a credit note, processed within ${DELIVERY_GUARANTEE.refundWithinWorkingDays} working days of approval.`,
    ],
    deadline: deadline.toISOString(),
    refundPaise: full,
    gstPaise: f.gstPaise,
  };
}

/** Refunds are processed within 7 working days of approval. */
export function refundProcessBy(approvedAt: Date, holidays: ReadonlySet<string> = new Set()): Date {
  return addWorkingDays(approvedAt, DELIVERY_GUARANTEE.refundWithinWorkingDays, holidays);
}
