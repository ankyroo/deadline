import type { createClient } from '@/lib/supabase/client';
import type { Note, Task, TimeEntry, UserSettings } from './types';
import type { WeeklyAvailability } from '@/lib/calculations/schedule';

type BrowserClient = ReturnType<typeof createClient>;

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  estimated_minutes: number;
  priority: Task['priority'];
  status: Task['status'];
  parent_task_id: string | null;
  weekly_schedule: WeeklyAvailability | null;
  created_at: string;
  completed_at: string | null;
}

interface EntryRow {
  id: string;
  task_id: string;
  spent_minutes: number;
  work_date: string;
  comment: string | null;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface SettingsRow {
  timezone: string;
  week_starts_on: 0 | 1;
  reminder_time: string;
  push_enabled: boolean;
}

export interface WorkspaceData {
  tasks: Task[];
  notes: Note[];
  settings: UserSettings;
}

export const DEFAULT_SETTINGS: UserSettings = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weekStartsOn: 1,
  reminderTime: '09:00',
  pushEnabled: false,
};

export async function loadWorkspace(client: BrowserClient, userId: string): Promise<WorkspaceData> {
  const [taskResult, entryResult, noteResult, settingsResult] = await Promise.all([
    client.from('tasks').select('*').order('deadline', { ascending: true }),
    client.from('time_entries').select('*').order('work_date', { ascending: false }),
    client.from('notes').select('*').order('updated_at', { ascending: false }),
    client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const firstError = taskResult.error ?? entryResult.error ?? noteResult.error ?? settingsResult.error;
  if (firstError) throw firstError;

  const entryRows = (entryResult.data ?? []) as unknown as EntryRow[];
  const entriesByTask = new Map<string, TimeEntry[]>();
  for (const row of entryRows) {
    const entry: TimeEntry = {
      id: row.id,
      taskId: row.task_id,
      spentMinutes: row.spent_minutes,
      workDate: row.work_date,
      comment: row.comment ?? '',
    };
    entriesByTask.set(row.task_id, [...(entriesByTask.get(row.task_id) ?? []), entry]);
  }

  const taskRows = (taskResult.data ?? []) as unknown as TaskRow[];
  const flatTasks: Task[] = taskRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    deadline: row.deadline,
    estimatedMinutes: row.estimated_minutes,
    priority: row.priority,
    status: row.status,
    parentTaskId: row.parent_task_id ?? null,
    weeklyAvailability: row.weekly_schedule ?? {},
    subtasks: [],
    createdAt: row.created_at,
    completedAt: row.completed_at,
    entries: entriesByTask.get(row.id) ?? [],
  }));

  const tasksById = new Map(flatTasks.map((task) => [task.id, task]));
  const roots: Task[] = [];
  for (const task of flatTasks) {
    const parent = task.parentTaskId ? tasksById.get(task.parentTaskId) : undefined;
    if (parent) parent.subtasks.push(task);
    else roots.push(task);
  }
  const tasks = roots;

  const noteRows = (noteResult.data ?? []) as unknown as NoteRow[];
  const notes: Note[] = noteRows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const settingsRow = settingsResult.data as unknown as SettingsRow | null;
  const settings: UserSettings = settingsRow
    ? {
        timezone: settingsRow.timezone,
        weekStartsOn: settingsRow.week_starts_on,
        reminderTime: settingsRow.reminder_time.slice(0, 5),
        pushEnabled: settingsRow.push_enabled,
      }
    : DEFAULT_SETTINGS;

  return { tasks, notes, settings };
}
