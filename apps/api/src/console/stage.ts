import { TenantStatus } from '@prisma/client';
import { addWorkingDays, daysBetween } from '../common/working-days';
import { DELIVERY_GUARANTEE } from './policies';

/**
 * Where a store is in the delivery pipeline. DERIVED from facts we already store (tenant status, intake completion,
 * latest QA run, expiry), never stored itself, so it can never disagree with them. Uses the existing TenantStatus enum.
 */
export type Stage = 'intake' | 'building' | 'qa' | 'review' | 'live' | 'expiring' | 'parked';

export const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'intake', label: 'Intake received' },
  { id: 'building', label: 'Building' },
  { id: 'qa', label: 'QA' },
  { id: 'review', label: 'Review' },
  { id: 'live', label: 'Live' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'parked', label: 'Parked' },
];

/** Plan length and the renewal reminder days (counted from go-live). */
export const PLAN_DAYS = 365;
export const RENEWAL_DAYS = [305, 335] as const;
/** LIVE stores within this many days of expiry show as "expiring" (= day 305 of a 365-day plan). */
export const EXPIRING_WINDOW_DAYS = PLAN_DAYS - RENEWAL_DAYS[0];

export interface StageFacts {
  status: TenantStatus;
  expiresAt: Date | null;
  /** null when the store was not created from an intake */
  intakeCompletedAt: Date | null | undefined;
  hasIntake: boolean;
  latestQa: { passed: boolean } | null;
}

export function deriveStage(f: StageFacts, now = new Date()): Stage {
  if (f.status === 'SUSPENDED' || f.status === 'PARKED') return 'parked';
  if (f.status === 'LIVE') {
    if (f.expiresAt && daysBetween(now, f.expiresAt) < EXPIRING_WINDOW_DAYS) return 'expiring';
    return 'live';
  }
  // BUILDING
  if (f.hasIntake && !f.intakeCompletedAt) return 'intake';
  if (!f.latestQa) return 'building';
  return f.latestQa.passed ? 'review' : 'qa';
}

/** The delivery promise: live within 7 working days of a completed intake (plus documented client delays). */
export function deliveryDeadline(intakeCompletedAt: Date | null | undefined, holidays: ReadonlySet<string>, clientDelayWorkingDays = 0): Date | null {
  if (!intakeCompletedAt) return null;
  return addWorkingDays(intakeCompletedAt, DELIVERY_GUARANTEE.workingDays + clientDelayWorkingDays, holidays);
}

/** Day N of the plan (day 0 = go-live). */
export function planDay(wentLiveAt: Date | null, now = new Date()): number | null {
  return wentLiveAt ? daysBetween(wentLiveAt, now) : null;
}
