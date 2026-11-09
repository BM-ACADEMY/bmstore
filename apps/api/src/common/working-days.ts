/**
 * Working days for the delivery promise and refund deadlines: Monday to Friday, minus configured public holidays
 * (WORKING_DAY_HOLIDAYS=YYYY-MM-DD,...). Dates are counted in India time (IST, UTC+5:30), so "7 working days"
 * means the same thing to the developer and the client.
 */
const IST_MS = 330 * 60_000;
const DAY = 86_400_000;

/** YYYY-MM-DD of the IST calendar day containing `d`. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

export function isWorkingDay(d: Date, holidays: ReadonlySet<string> = new Set()): boolean {
  const ist = new Date(d.getTime() + IST_MS);
  const dow = ist.getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(istDay(d));
}

/** The instant `n` working days after `from` (same time of day). n = 0 returns `from`. */
export function addWorkingDays(from: Date, n: number, holidays: ReadonlySet<string> = new Set()): Date {
  let d = new Date(from.getTime());
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d = new Date(d.getTime() + DAY);
    if (isWorkingDay(d, holidays)) left--;
  }
  return d;
}

/** Whole working days strictly after `from`'s day up to and including `to`'s day (0 if to <= from). */
export function workingDaysBetween(from: Date, to: Date, holidays: ReadonlySet<string> = new Set()): number {
  if (to.getTime() <= from.getTime()) return 0;
  let n = 0;
  let d = new Date(from.getTime());
  const end = istDay(to);
  while (istDay(d) < end) {
    d = new Date(d.getTime() + DAY);
    if (isWorkingDay(d, holidays)) n++;
  }
  return n;
}

/** Whole calendar days from `from` to `to` (floor). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}
