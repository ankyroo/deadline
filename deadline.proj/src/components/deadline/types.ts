export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'active' | 'completed' | 'archived';
export type PageView = 'calendar' | 'active' | 'completed' | 'stats';
export type CalendarMode = 'month' | 'week' | 'day';

import type { WeeklyAvailability } from '@/lib/calculations/schedule';

export interface TimeEntry {
  id: string;
  taskId: string;
  spentMinutes: number;
  workDate: string;
  comment: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string;
  estimatedMinutes: number;
  priority: Priority;
  status: TaskStatus;
  parentTaskId: string | null;
  weeklyAvailability: WeeklyAvailability;
  subtasks: Task[];
  createdAt: string;
  completedAt: string | null;
  entries: TimeEntry[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  timezone: string;
  weekStartsOn: 0 | 1;
  reminderTime: string;
  pushEnabled: boolean;
}

export interface TaskFormValues {
  title: string;
  description: string;
  deadline: string;
  estimatedMinutes: number;
  priority: Priority;
  weeklyAvailability: WeeklyAvailability;
  parentTaskId?: string | null;
  subtasks?: SubtaskFormValues[];
}

export interface SubtaskFormValues {
  title: string;
  description: string;
  deadline: string;
  estimatedMinutes: number;
  priority: Priority;
  weeklyAvailability: WeeklyAvailability;
}

export interface EntryFormValues {
  spentMinutes: number;
  workDate: string;
  comment: string;
}
