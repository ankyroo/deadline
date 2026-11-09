import { calculate, formatMinutes as formatDuration } from '@/lib/calculations/deadline';
import { calculateCombinedScheduleCapacity, calculateScheduleCapacity, distributeMinutesAcrossSlots } from '@/lib/calculations/schedule';
import type { UserSettings, Task } from './types';

export const formatMinutes = formatDuration;

export interface TaskCalculation {
  remainingMinutes: number;
  overspentMinutes: number;
  daysRemaining: number;
  minutesPerWorkday: number;
  availableMinutes: number;
  sessions: number;
  shortageMinutes: number;
  scheduleConfigured: boolean;
  plannedMinutesByDate: Record<string, number>;
  isOverdue: boolean;
  risk: 'ok' | 'warn' | 'bad';
  progressPct: number;
  spentMinutes: number;
}

export function taskCalculation(task: Task, settings: UserSettings, now = new Date()): TaskCalculation {
  if (task.subtasks.length) {
    const children = task.subtasks.map((subtask) => taskCalculation(subtask, settings, now));
    const planningChildren = children.filter((child) => child.remainingMinutes > 0);
    const remainingMinutes = children.reduce((sum, child) => sum + child.remainingMinutes, 0);
    const spentMinutes = children.reduce((sum, child) => sum + child.spentMinutes, 0);
    const overspentMinutes = children.reduce((sum, child) => sum + child.overspentMinutes, 0);
    const estimatedMinutes = task.subtasks.reduce((sum, child) => sum + child.estimatedMinutes, 0);
    const combinedCapacity = calculateCombinedScheduleCapacity(
      task.subtasks.filter((_, index) => children[index].remainingMinutes > 0).map((child) => ({ weeklyAvailability: child.weeklyAvailability, deadline: child.deadline })),
      todayInTimezone(now, settings.timezone), task.deadline, settings.timezone, now,
    );
    const availableMinutes = combinedCapacity.availableMinutes;
    const sessions = combinedCapacity.sessions;
    const scheduleConfigured = combinedCapacity.configured;
    const shortageMinutes = scheduleConfigured ? Math.max(0, remainingMinutes - availableMinutes) : 0;
    const base = calculate({
      estimatedMinutes,
      spentMinutes,
      deadline: task.deadline,
      status: task.status,
    }, now, settings.timezone);
    const isOverdue = base.isOverdue || planningChildren.some((child) => child.isOverdue);
    const risk = task.status === 'completed' ? 'ok' : isOverdue ? 'bad' : !scheduleConfigured || shortageMinutes > 0 ? 'warn' : 'ok';
    return {
      ...base,
      remainingMinutes,
      overspentMinutes,
      spentMinutes,
      availableMinutes,
      sessions,
      shortageMinutes,
      scheduleConfigured,
      plannedMinutesByDate: distributeMinutesAcrossSlots(remainingMinutes, combinedCapacity.slots),
      minutesPerWorkday: sessions ? Math.ceil(remainingMinutes / sessions) : remainingMinutes,
      isOverdue,
      risk,
      progressPct: task.status === 'completed' ? 100 : estimatedMinutes ? Math.min(100, Math.round((spentMinutes / estimatedMinutes) * 100)) : 0,
    };
  }

  const spentMinutes = task.entries.reduce((total, entry) => total + entry.spentMinutes, 0);
  const base = calculate({
    estimatedMinutes: task.estimatedMinutes,
    spentMinutes,
    deadline: task.deadline,
    status: task.status,
  }, now, settings.timezone);
  const remainingMinutes = task.status === 'completed' ? 0 : base.remainingMinutes;
  const overspentMinutes = Math.max(0, spentMinutes - task.estimatedMinutes);
  const capacity = calculateScheduleCapacity(task.weeklyAvailability, base.daysRemaining ? todayInTimezone(now, settings.timezone) : task.deadline, task.deadline, settings.timezone, now);
  const shortageMinutes = capacity.configured && task.status === 'active' ? Math.max(0, remainingMinutes - capacity.availableMinutes) : 0;
  const plannedMinutesByDate = distributeMinutesAcrossSlots(remainingMinutes, capacity.slots);
  const risk = task.status === 'completed' ? 'ok' : base.isOverdue ? 'bad' : !capacity.configured || shortageMinutes > 0 ? 'warn' : 'ok';

  return {
    ...base,
    remainingMinutes,
    overspentMinutes,
    spentMinutes,
    availableMinutes: capacity.availableMinutes,
    sessions: capacity.sessions,
    shortageMinutes,
    scheduleConfigured: capacity.configured,
    plannedMinutesByDate,
    minutesPerWorkday: capacity.sessions ? Math.ceil(remainingMinutes / capacity.sessions) : remainingMinutes,
    risk,
  };
}

function todayInTimezone(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function riskLabel(risk: 'ok' | 'warn' | 'bad', overdue: boolean): string {
  if (overdue) return 'Просрочена';
  if (risk === 'warn') return 'Не хватает времени';
  if (risk === 'bad') return 'Есть риск';
  return 'Успеваете';
}

export function priorityLabel(priority: Task['priority']): string {
  return { low: 'Низкая', medium: 'Средняя', high: 'Высокая' }[priority];
}
