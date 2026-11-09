import { localDate } from '@/lib/calculations/deadline';

export const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function todayInTimezone(timezone: string): string {
  try {
    return localDate(new Date(), timezone);
  } catch {
    return dateKey(new Date());
  }
}

export function timestampDateKey(timestamp: string, timezone: string): string {
  try {
    return localDate(new Date(timestamp), timezone);
  } catch {
    return timestamp.slice(0, 10);
  }
}

export function formatDate(key: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
  return dateFromKey(key).toLocaleDateString('ru-RU', options);
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  return start;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  next.setDate(next.getDate() + amount);
  return next;
}
