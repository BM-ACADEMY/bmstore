import { addWorkingDays, workingDaysBetween } from '../src/common/working-days';
import { evaluateRefund, refundProcessBy, RefundFacts } from '../src/console/refund-rule';
import { financialYear } from '../src/console/refund.service';
import { deriveStage, deliveryDeadline } from '../src/console/stage';

// Monday 2 Nov 2026, 10:00 IST
const MON = new Date('2026-11-02T04:30:00Z');
const day = (n: number) => new Date(MON.getTime() + n * 86_400_000);
const facts = (over: Partial<RefundFacts> = {}): RefundFacts => ({
  intakeCompletedAt: MON, wentLiveAt: null, requestedAt: day(20), clientDelayWorkingDays: 0, reason: 'not_delivered', amountPaidPaise: 1_180_000, gstPaise: 180_000, ...over,
});

describe('working days (IST, Mon-Fri, holidays)', () => {
  it('7 working days from Monday is the next Wednesday; weekends skipped; holidays skipped', () => {
    expect(addWorkingDays(MON, 7).toISOString()).toBe(day(9).toISOString()); // Wed 11 Nov
    expect(addWorkingDays(day(4), 1).toISOString()).toBe(day(7).toISOString()); // Fri -> Mon
    expect(addWorkingDays(MON, 7, new Set(['2026-11-04'])).toISOString()).toBe(day(10).toISOString());
    expect(workingDaysBetween(MON, day(9))).toBe(7);
    expect(workingDaysBetween(day(9), MON)).toBe(0);
  });
  it('a Saturday-night IST timestamp counts as Saturday even though it is Saturday afternoon UTC', () => {
    const satNightIst = new Date('2026-11-07T18:00:00Z'); // 23:30 IST Saturday
    expect(addWorkingDays(satNightIst, 1).toISOString()).toBe(new Date('2026-11-09T18:00:00Z').toISOString()); // Monday
  });
});

describe('refund rule (store-delivery guarantee)', () => {
  it('ELIGIBLE: not live by the deadline -> full refund including GST', () => {
    const d = evaluateRefund(facts());
    expect(d).toMatchObject({ eligible: true, rule: 'not_delivered', refundPaise: 1_180_000, gstPaise: 180_000 });
    expect(d.deadline).toBe(day(9).toISOString());
    expect(d.explanation.join(' ')).toContain('Full refund including GST: ₹11,800 (GST ₹1,800)');
    expect(d.explanation.join(' ')).toContain('within 7 working days of approval');
  });
  it('NOT eligible: intake not complete (clock never started; late client details not covered)', () => {
    const d = evaluateRefund(facts({ intakeCompletedAt: null }));
    expect(d).toMatchObject({ eligible: false, rule: 'intake_incomplete', refundPaise: 0, deadline: null });
  });
  it('NOT eligible: still inside the window', () => {
    expect(evaluateRefund(facts({ requestedAt: day(8) }))).toMatchObject({ eligible: false, rule: 'within_window' });
    expect(evaluateRefund(facts({ requestedAt: day(9) }))).toMatchObject({ eligible: false, rule: 'within_window' }); // the deadline instant itself is in time
  });
  it('NOT eligible: delivered on time, whatever the reason (change of mind after go-live)', () => {
    expect(evaluateRefund(facts({ wentLiveAt: day(9) }))).toMatchObject({ eligible: false, rule: 'delivered_on_time' });
    expect(evaluateRefund(facts({ wentLiveAt: day(3), reason: 'change_of_mind' }))).toMatchObject({ eligible: false, rule: 'delivered_on_time' });
  });
  it('client-side delay (late details, Razorpay KYC) pushes the deadline out by those working days', () => {
    // not live on day 11 (Fri): without delay that is late, with 3 days of KYC delay the deadline is Mon day 14
    expect(evaluateRefund(facts({ requestedAt: day(11) })).eligible).toBe(true);
    const d = evaluateRefund(facts({ requestedAt: day(11), clientDelayWorkingDays: 3 }));
    expect(d).toMatchObject({ eligible: false, rule: 'within_window' });
    expect(d.deadline).toBe(day(14).toISOString());
    expect(d.explanation.join(' ')).toContain('+ 3 working days of client-side delay');
    // live on day 13 with that delay = on time
    expect(evaluateRefund(facts({ wentLiveAt: day(13), clientDelayWorkingDays: 3 })).rule).toBe('delivered_on_time');
  });
  it('late go-live: eligible when the store was late, not when the request is a change of mind after go-live', () => {
    expect(evaluateRefund(facts({ wentLiveAt: day(12) }))).toMatchObject({ eligible: true, rule: 'late_delivery', refundPaise: 1_180_000 });
    expect(evaluateRefund(facts({ wentLiveAt: day(12), reason: 'change_of_mind' }))).toMatchObject({ eligible: false, rule: 'change_of_mind_after_go_live' });
  });
  it('change of mind BEFORE go-live past the deadline is still a failure to deliver (covered)', () => {
    expect(evaluateRefund(facts({ reason: 'change_of_mind' }))).toMatchObject({ eligible: true, rule: 'not_delivered' });
  });
  it('holidays extend the deadline', () => {
    const d = evaluateRefund(facts({ requestedAt: day(10) }), new Set(['2026-11-04', '2026-11-05']));
    expect(d).toMatchObject({ eligible: false, rule: 'within_window' });
  });
  it('money must be whole paise; GST below the total', () => {
    expect(() => evaluateRefund(facts({ amountPaidPaise: 100.5 }))).toThrow();
    expect(() => evaluateRefund(facts({ gstPaise: 1_180_000 }))).toThrow();
    expect(() => evaluateRefund(facts({ gstPaise: -1 }))).toThrow();
  });
  it('refunds are due within 7 working days of approval; credit note financial year', () => {
    expect(refundProcessBy(MON).toISOString()).toBe(day(9).toISOString());
    expect(financialYear(new Date('2026-11-08T00:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2027-03-31T12:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2027-03-31T19:00:00Z'))).toBe('2027-28'); // already 1 April in IST
  });
});

describe('stage derivation', () => {
  const now = new Date('2026-11-08T06:00:00Z');
  const base = { status: 'BUILDING' as const, expiresAt: null, hasIntake: true, intakeCompletedAt: now, latestQa: null };
  it('maps facts to the seven stages', () => {
    expect(deriveStage({ ...base, intakeCompletedAt: null }, now)).toBe('intake');
    expect(deriveStage(base, now)).toBe('building');
    expect(deriveStage({ ...base, latestQa: { passed: false } }, now)).toBe('qa');
    expect(deriveStage({ ...base, latestQa: { passed: true } }, now)).toBe('review');
    expect(deriveStage({ ...base, status: 'LIVE', expiresAt: new Date(now.getTime() + 200 * 86_400_000) }, now)).toBe('live');
    expect(deriveStage({ ...base, status: 'LIVE', expiresAt: new Date(now.getTime() + 59 * 86_400_000) }, now)).toBe('expiring');
    expect(deriveStage({ ...base, status: 'LIVE', expiresAt: new Date(now.getTime() - 86_400_000) }, now)).toBe('expiring');
    expect(deriveStage({ ...base, status: 'PARKED' }, now)).toBe('parked');
    expect(deriveStage({ ...base, status: 'SUSPENDED' }, now)).toBe('parked');
    expect(deriveStage({ ...base, hasIntake: false, intakeCompletedAt: undefined }, now)).toBe('building');
  });
  it('delivery deadline = completed intake + 7 working days', () => {
    expect(deliveryDeadline(null, new Set())).toBeNull();
    expect(deliveryDeadline(MON, new Set())!.toISOString()).toBe(day(9).toISOString());
  });
});
