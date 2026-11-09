import { describe, expect, it } from 'vitest';
import { calculate, dayDiff, formatMinutes, localDate } from './deadline';

const base = { estimatedMinutes: 900, spentMinutes: 240, deadline: '2026-11-20', dailyLimitMinutes: 240 };
const mon = new Date('2026-11-16T12:00:00Z'); // 5 days incl. deadline day

describe('calculate', () => {
  it('spec example: 900 est, 240 spent, 5 days -> 132 min/day', () => {
    const r = calculate(base, mon);
    expect(r.remainingMinutes).toBe(660);
    expect(r.daysRemaining).toBe(5);
    expect(r.dailyRequiredMinutes).toBe(132);
    expect(r.risk).toBe('ok');
    expect(formatMinutes(r.dailyRequiredMinutes)).toBe('2 ч 12 мин');
  });

  it('rounds up to a whole minute', () => {
    expect(calculate({ ...base, estimatedMinutes: 241, spentMinutes: 0, deadline: '2026-11-18' }, mon)
      .dailyRequiredMinutes).toBe(81); // 241 / 3 = 80.33 -> 81
  });

  it('recalculates after adding and after deleting an entry', () => {
    expect(calculate({ ...base, spentMinutes: 420 }, mon).dailyRequiredMinutes).toBe(96);
    expect(calculate({ ...base, spentMinutes: 240 }, mon).dailyRequiredMinutes).toBe(132);
  });

  it('deadline today: one day, no division by zero', () => {
    const r = calculate({ ...base, deadline: '2026-11-16' }, mon);
    expect(r.daysRemaining).toBe(1);
    expect(r.dailyRequiredMinutes).toBe(660);
    expect(r.risk).toBe('bad');
  });

  it('deadline tomorrow = 2 days', () => {
    expect(calculate({ ...base, deadline: '2026-11-17' }, mon).daysRemaining).toBe(2);
  });

  it('overdue active task is flagged but not completed', () => {
    const r = calculate({ ...base, deadline: '2026-11-10' }, mon);
    expect(r.isOverdue).toBe(true);
    expect(r.daysRemaining).toBe(0);
    expect(r.dailyRequiredMinutes).toBe(660);
    expect(r.risk).toBe('bad');
  });

  it('completed task is never overdue', () => {
    expect(calculate({ ...base, deadline: '2026-11-10', status: 'completed' }, mon).isOverdue).toBe(false);
  });

  it('overspent: remaining 0, overspend reported separately', () => {
    const r = calculate({ ...base, spentMinutes: 1000 }, mon);
    expect(r.remainingMinutes).toBe(0);
    expect(r.overspentMinutes).toBe(100);
    expect(r.dailyRequiredMinutes).toBe(0);
    expect(r.progressPct).toBe(100);
    expect(r.risk).toBe('ok');
  });

  it('risk levels: ok / warn / bad', () => {
    expect(calculate({ ...base, dailyLimitMinutes: 132 }, mon).risk).toBe('ok');
    expect(calculate({ ...base, dailyLimitMinutes: 120 }, mon).risk).toBe('warn'); // 132 <= 180
    expect(calculate({ ...base, dailyLimitMinutes: 80 }, mon).risk).toBe('bad'); // 132 > 120
  });

  it('respects the user time zone around midnight', () => {
    const now = new Date('2026-11-20T23:30:00Z');
    expect(calculate({ ...base, deadline: '2026-11-20' }, now, 'UTC').isOverdue).toBe(false);
    expect(calculate({ ...base, deadline: '2026-11-20' }, now, 'Asia/Tokyo').isOverdue).toBe(true);
  });
});

describe('date helpers', () => {
  it('localDate', () => {
    expect(localDate(new Date('2026-11-20T23:30:00Z'), 'Asia/Jerusalem')).toBe('2026-11-21');
  });
  it('dayDiff across month and DST boundaries', () => {
    expect(dayDiff('2026-10-30', '2026-11-02')).toBe(3);
    expect(dayDiff('2026-03-27', '2026-03-30')).toBe(3);
  });
});
