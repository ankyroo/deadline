export type Risk = 'ok' | 'warn' | 'bad';
export type TaskStatus = 'active' | 'completed' | 'archived';

export interface CalcInput {
  estimatedMinutes: number;
  spentMinutes: number;
  /** Deadline as a calendar date, YYYY-MM-DD (no time zone). */
  deadline: string;
  /** Optional legacy limit retained for compatibility with the pure calculation helper. */
  dailyLimitMinutes?: number;
  status?: TaskStatus;
}

export interface CalcResult {
  remainingMinutes: number;
  overspentMinutes: number;
  /** Calendar days left, today and deadline day included. 0 when overdue. */
  daysRemaining: number;
  dailyRequiredMinutes: number;
  isOverdue: boolean;
  risk: Risk;
  progressPct: number;
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Whole days from date a to date b (both YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(t(b) - t(a));
}

export function calculate(i: CalcInput, now: Date = new Date(), timeZone = 'UTC'): CalcResult {
  const remainingMinutes = Math.max(0, i.estimatedMinutes - i.spentMinutes);
  const overspentMinutes = Math.max(0, i.spentMinutes - i.estimatedMinutes);
  const diff = dayDiff(localDate(now, timeZone), i.deadline);
  const isOverdue = (i.status ?? 'active') === 'active' && diff < 0;
  const daysRemaining = diff < 0 ? 0 : diff + 1;

  // Deadline passed: the whole remainder is "due now" (never divide by zero).
  const dailyRequiredMinutes =
    remainingMinutes === 0 ? 0 : daysRemaining === 0 ? remainingMinutes : Math.ceil(remainingMinutes / daysRemaining);

  let risk: Risk = 'ok';
  if (remainingMinutes > 0) {
    if (isOverdue || (i.dailyLimitMinutes !== undefined && dailyRequiredMinutes > i.dailyLimitMinutes * 1.5)) risk = 'bad';
    else if (i.dailyLimitMinutes !== undefined && dailyRequiredMinutes > i.dailyLimitMinutes) risk = 'warn';
  }

  const progressPct = i.estimatedMinutes > 0
    ? Math.min(100, Math.round((i.spentMinutes / i.estimatedMinutes) * 100)) : 0;

  return { remainingMinutes, overspentMinutes, daysRemaining, dailyRequiredMinutes, isOverdue, risk, progressPct };
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} ч` : '', r || !h ? `${r} мин` : ''].filter(Boolean).join(' ');
}
