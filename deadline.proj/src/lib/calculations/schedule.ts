export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface WorkWindow {
  start: string;
  end: string;
}

export type WeeklyAvailability = Partial<Record<WeekdayKey, WorkWindow>>;

export interface AvailableSlot {
  date: string;
  capacityMinutes: number;
}

export interface ScheduleCapacity {
  configured: boolean;
  availableMinutes: number;
  sessions: number;
  slots: AvailableSlot[];
}

export function weekdayKeyForDate(date: string): WeekdayKey {
  return WEEKDAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

export function validWindow(window: WorkWindow | undefined): window is WorkWindow {
  if (!window || !/^\d{2}:\d{2}$/.test(window.start) || !/^\d{2}:\d{2}$/.test(window.end)) return false;
  const start = minuteOfDay(window.start);
  const end = minuteOfDay(window.end);
  return start >= 0 && start < 24 * 60 && end > start && end < 24 * 60;
}

export function workWindowsForDate(schedule: WeeklyAvailability, date: string): WorkWindow[] {
  const window = schedule[weekdayKeyForDate(date)];
  return validWindow(window) ? [window] : [];
}

export function calculateScheduleCapacity(
  schedule: WeeklyAvailability,
  fromDate: string,
  deadline: string,
  timeZone: string,
  now = new Date(),
): ScheduleCapacity {
  const configured = WEEKDAY_KEYS.some((day) => validWindow(schedule[day]));
  if (!configured || deadline < fromDate) return { configured, availableMinutes: 0, sessions: 0, slots: [] };

  const today = localDate(now, timeZone);
  const firstDate = fromDate > today ? fromDate : today;
  if (deadline < firstDate) return { configured, availableMinutes: 0, sessions: 0, slots: [] };

  const currentMinute = minuteInTimezone(now, timeZone);
  const slots: AvailableSlot[] = [];
  for (let date = firstDate; date <= deadline; date = addDate(date, 1)) {
    const window = schedule[weekdayKeyForDate(date)];
    if (!validWindow(window)) continue;
    const start = minuteOfDay(window.start);
    const end = minuteOfDay(window.end);
    const effectiveStart = date === today ? Math.max(start, currentMinute) : start;
    const capacityMinutes = Math.max(0, end - effectiveStart);
    if (capacityMinutes > 0) slots.push({ date, capacityMinutes });
  }

  return {
    configured,
    availableMinutes: slots.reduce((sum, slot) => sum + slot.capacityMinutes, 0),
    sessions: slots.length,
    slots,
  };
}

export function calculateCombinedScheduleCapacity(
  schedules: Array<{ weeklyAvailability: WeeklyAvailability; deadline: string }>,
  fromDate: string,
  deadline: string,
  timeZone: string,
  now = new Date(),
): ScheduleCapacity {
  const configured = schedules.every(({ weeklyAvailability }) => WEEKDAY_KEYS.some((day) => validWindow(weeklyAvailability[day])));
  if (!schedules.length || deadline < fromDate) return { configured, availableMinutes: 0, sessions: 0, slots: [] };

  const today = localDate(now, timeZone);
  const firstDate = fromDate > today ? fromDate : today;
  if (deadline < firstDate) return { configured, availableMinutes: 0, sessions: 0, slots: [] };

  const currentMinute = minuteInTimezone(now, timeZone);
  const slots: AvailableSlot[] = [];
  for (let date = firstDate; date <= deadline; date = addDate(date, 1)) {
    const intervals = schedules
      .filter((item) => date <= item.deadline)
      .map((item) => item.weeklyAvailability[weekdayKeyForDate(date)])
      .filter((window): window is WorkWindow => validWindow(window))
      .map((window) => ({
        start: date === today ? Math.max(minuteOfDay(window.start), currentMinute) : minuteOfDay(window.start),
        end: minuteOfDay(window.end),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);

    let available = 0;
    let intervalStart = -1;
    let intervalEnd = -1;
    for (const interval of intervals) {
      if (intervalStart < 0) {
        intervalStart = interval.start;
        intervalEnd = interval.end;
      } else if (interval.start <= intervalEnd) {
        intervalEnd = Math.max(intervalEnd, interval.end);
      } else {
        available += intervalEnd - intervalStart;
        intervalStart = interval.start;
        intervalEnd = interval.end;
      }
    }
    if (intervalStart >= 0) available += intervalEnd - intervalStart;
    if (available > 0) slots.push({ date, capacityMinutes: available });
  }

  return {
    configured,
    availableMinutes: slots.reduce((sum, slot) => sum + slot.capacityMinutes, 0),
    sessions: slots.length,
    slots,
  };
}

export function distributeMinutesAcrossSlots(totalMinutes: number, slots: AvailableSlot[]): Record<string, number> {
  const remainingSlots = slots.filter((slot) => slot.capacityMinutes > 0);
  const plan: Record<string, number> = {};
  let remaining = Math.max(0, totalMinutes);

  remainingSlots.forEach((slot, index) => {
    const slotsLeft = remainingSlots.length - index;
    const planned = Math.min(slot.capacityMinutes, Math.ceil(remaining / slotsLeft));
    if (planned > 0) plan[slot.date] = planned;
    remaining -= planned;
  });

  return plan;
}

function minuteOfDay(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function addDate(date: string, amount: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function minuteInTimezone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}
