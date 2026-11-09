'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AlertCircle, LogOut, Plus, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { safeAuthError, safeDataError, UserFacingError } from '@/lib/supabase/safe-errors';
import { todayInTimezone } from './date-utils';
import { loadWorkspace, DEFAULT_SETTINGS } from './supabase-data';
import { formatMinutes } from './task-utils';
import { AuthScreen, PasswordResetScreen } from './AuthScreen';
import { CalendarView, calendarHeading } from './CalendarView';
import { Sidebar } from './Sidebar';
import {
  EntryFormDialog,
  FocusDialog,
  LoadingScreen,
  MissingConfigScreen,
  NotesDialog,
  SettingsDialog,
  TaskDetailsDialog,
  TaskFormDialog,
  dateForEntry,
  focusEntryDate,
} from './Dialogs';
import { ActiveTasksView, CompletedTasksView, StatsView } from './TaskViews';
import type { CalendarMode, EntryFormValues, Note, PageView, Task, TaskFormValues, UserSettings } from './types';
import { WEEKDAY_KEYS, validWindow } from '@/lib/calculations/schedule';

const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type DialogState =
  | { type: 'task-form'; taskId?: string; date?: string }
  | { type: 'task-details'; taskId: string }
  | { type: 'entry-form'; taskId: string; entryId?: string }
  | { type: 'notes'; noteId: string | null }
  | { type: 'settings' }
  | { type: 'focus'; taskId: string };

export function DeadlineApp() {
  const client = useMemo(() => supabaseConfigured ? createClient() : null, []);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [page, setPage] = useState<PageView>('calendar');
  const [mode, setMode] = useState<CalendarMode>('month');
  const [cursor, setCursor] = useState(() => new Date(0));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [dataReady, setDataReady] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [focusElapsedMs, setFocusElapsedMs] = useState(0);
  const [focusRunning, setFocusRunning] = useState(true);
  const currentUserId = useRef<string | null>(null);

  const userId = user?.id;

  const refresh = useCallback(async (showLoading = false) => {
    if (!client || !userId) return;
    if (showLoading) setDataBusy(true);
    setDataError('');
    try {
      const data = await loadWorkspace(client, userId);
      setTasks(data.tasks);
      setNotes(data.notes);
      setSettings(data.settings);
      setDataReady(true);
    } catch (error) {
      setDataError(safeDataError(error, 'Не удалось загрузить ваши данные.'));
      setDataReady(true);
    } finally {
      setDataBusy(false);
    }
  }, [client, userId]);

  useEffect(() => {
    if (!client) {
      return;
    }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      const nextUserId = session?.user.id ?? null;
      if (nextUserId !== currentUserId.current) {
        setDataReady(false);
        if (nextUserId) setCursor(new Date());
      }
      currentUserId.current = nextUserId;
      setUser(session?.user ?? null);
      setAuthReady(true);
      setAuthError('');
      if (!session) {
        currentUserId.current = null;
        setTasks([]);
        setNotes([]);
        setDataReady(false);
        setDialog(null);
      }
    });
    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(safeAuthError(error));
      const nextUserId = data.session?.user.id ?? null;
      if (nextUserId !== currentUserId.current) {
        setDataReady(false);
        if (nextUserId) setCursor(new Date());
      }
      currentUserId.current = nextUserId;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(safeAuthError(error));
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => { void refresh(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [userId, refresh]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const notify = useCallback((message: string) => setToastMessage(message), []);

  async function submitAuth(values: { email: string; password: string; username: string }, mode: 'sign-in' | 'sign-up') {
    if (!client) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthMessage('');
    try {
      if (mode === 'sign-in') {
        const { error } = await client.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
        if (error) throw error;
      } else {
        const { data, error } = await client.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: { data: { username: values.username.trim() } },
        });
        if (error) throw error;
        if (!data.session) setAuthMessage('Проверьте почту и подтвердите адрес, чтобы войти.');
      }
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestPasswordReset(email: string) {
    if (!client) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthMessage('');
    try {
      const redirectTo = new URL('/', window.location.origin).toString();
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setAuthMessage('Если аккаунт с таким адресом существует, мы отправили письмо для восстановления.');
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function updateRecoveredPassword(password: string) {
    if (!client) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      window.history.replaceState({}, '', window.location.pathname);
      setPasswordRecovery(false);
      notify('Пароль обновлён.');
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) notify(safeAuthError(error));
    else notify('Вы вышли из аккаунта.');
  }

  async function saveTask(values: TaskFormValues) {
    if (!client || !userId || dialog?.type !== 'task-form') return;
    const taskId = dialog.taskId;
    if (!values.title.trim() || values.estimatedMinutes <= 0) throw new Error('Укажите название и оценку времени больше нуля.');
    const existingTask = taskId ? findTask(tasks, taskId) : undefined;
    const editingGroup = Boolean(existingTask?.subtasks.length);
    if (values.parentTaskId) {
      const parent = findTask(tasks, values.parentTaskId);
      if (!parent || values.deadline > parent.deadline) throw new Error('Дедлайн подзадачи не может быть позже дедлайна большой задачи.');
    }
    if (values.subtasks?.some((subtask) => !subtask.title.trim() || subtask.estimatedMinutes <= 0 ||
      !WEEKDAY_KEYS.some((day) => validWindow(subtask.weeklyAvailability[day])) || subtask.deadline > values.deadline)) {
      throw new Error('Проверьте подзадачи: у каждой нужны оценка, доступное время и дедлайн не позже общей задачи.');
    }
    if (!values.subtasks?.length && !editingGroup && !WEEKDAY_KEYS.some((day) => validWindow(values.weeklyAvailability[day]))) {
      throw new Error('Выберите хотя бы один рабочий день с корректным интервалом.');
    }
    const payload = {
      title: values.title,
      description: values.description || null,
      deadline: values.deadline,
      estimated_minutes: values.estimatedMinutes,
      priority: values.priority,
      weekly_schedule: values.weeklyAvailability,
      parent_task_id: values.parentTaskId ?? null,
    };
    if (taskId) {
      const { error } = await client.from('tasks').update(payload).eq('id', taskId);
      if (error) throw error;
      if (values.parentTaskId) {
        const parent = findTask(tasks, values.parentTaskId);
        if (parent) {
          const totalEstimate = parent.subtasks.reduce((sum, child) => sum + (child.id === taskId ? values.estimatedMinutes : child.estimatedMinutes), 0);
          const { error: parentError } = await client.from('tasks').update({ estimated_minutes: totalEstimate }).eq('id', parent.id);
          if (parentError) throw parentError;
        }
      }
      await refresh();
      setDialog({ type: 'task-details', taskId });
      notify('Задача обновлена.');
      return;
    }
    const { data, error } = await client.from('tasks').insert({ ...payload, user_id: userId, status: 'active' }).select('id').single();
    if (error) throw error;
    if (values.subtasks?.length) {
      const childRows = values.subtasks.map((subtask) => ({
        title: subtask.title.trim(),
        description: subtask.description || null,
        deadline: subtask.deadline,
        estimated_minutes: subtask.estimatedMinutes,
        priority: subtask.priority,
        weekly_schedule: subtask.weeklyAvailability,
        parent_task_id: data.id,
        user_id: userId,
        status: 'active',
      }));
      const { error: childError } = await client.from('tasks').insert(childRows);
      if (childError) {
        await client.from('tasks').delete().eq('id', data.id);
        throw childError;
      }
    }
    await refresh();
    setDialog({ type: 'task-details', taskId: data.id });
    notify(values.subtasks?.length ? 'Большая задача создана.' : 'Задача создана.');
  }

  async function saveEntry(values: EntryFormValues) {
    if (!client || !userId || dialog?.type !== 'entry-form') return;
    const { taskId, entryId } = dialog;
    const payload = {
      spent_minutes: values.spentMinutes,
      work_date: values.workDate,
      comment: values.comment || null,
    };
    if (entryId) {
      const { error } = await client.from('time_entries').update(payload).eq('id', entryId).eq('task_id', taskId);
      if (error) throw error;
    } else {
      const { error } = await client.from('time_entries').insert({ ...payload, task_id: taskId, user_id: userId });
      if (error) throw error;
    }
    await refresh();
    setDialog({ type: 'task-details', taskId });
    notify(entryId ? 'Запись обновлена.' : 'Время добавлено.');
  }

  async function deleteEntry(taskId: string, entryId: string) {
    if (!client) return;
    if (!window.confirm('Удалить эту запись времени?')) return;
    const { error } = await client.from('time_entries').delete().eq('id', entryId).eq('task_id', taskId);
    if (error) { notify(safeDataError(error, 'Не удалось удалить запись времени.')); return; }
    await refresh();
    notify('Запись удалена.');
  }

  async function completeTask(task: Task) {
    if (task.subtasks.some((subtask) => subtask.status !== 'completed')) {
      notify('Сначала завершите все подзадачи.');
      return;
    }
    if (!client || !window.confirm('Завершить задачу? История учёта времени сохранится.')) return;
    const { error } = await client.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id);
    if (error) { notify(safeDataError(error, 'Не удалось завершить задачу.')); return; }
    if (task.parentTaskId) {
      const parent = findTask(tasks, task.parentTaskId);
      if (parent && parent.subtasks.every((subtask) => subtask.id === task.id || subtask.status === 'completed')) {
        const { error: parentError } = await client.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', parent.id);
        if (parentError) { notify(safeDataError(parentError, 'Подзадача завершена, но не удалось обновить статус большой задачи.')); }
      }
    }
    await refresh();
    setDialog(null);
    notify('Задача завершена. Отличная работа!');
  }

  async function reopenTask(taskId: string) {
    if (!client) return;
    const task = findTask(tasks, taskId);
    if (task?.subtasks.length) {
      const { error: childError } = await client.from('tasks').update({ status: 'active', completed_at: null }).in('id', task.subtasks.map((subtask) => subtask.id));
      if (childError) { notify(safeDataError(childError, 'Не удалось вернуть подзадачи в активные.')); return; }
    }
    const ids = [taskId, ...(task?.parentTaskId ? [task.parentTaskId] : [])];
    const { error } = await client.from('tasks').update({ status: 'active', completed_at: null }).in('id', ids);
    if (error) { notify(safeDataError(error, 'Не удалось вернуть задачу в активные.')); return; }
    await refresh();
    setDialog(null);
    notify('Задача возвращена в активные.');
  }

  async function deleteTask(task: Task) {
    if (!client || !window.confirm(`Удалить «${task.title}» вместе с историей работы?`)) return;
    const { error } = await client.from('tasks').delete().eq('id', task.id);
    if (error) { notify(safeDataError(error, 'Не удалось удалить задачу.')); return; }
    if (task.parentTaskId) {
      const parent = findTask(tasks, task.parentTaskId);
      const remainingEstimate = parent?.subtasks.filter((subtask) => subtask.id !== task.id).reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0) ?? 0;
      if (parent && remainingEstimate > 0) {
        const { error: parentError } = await client.from('tasks').update({ estimated_minutes: remainingEstimate }).eq('id', parent.id);
        if (parentError) { notify(safeDataError(parentError, 'Подзадача удалена, но сумма оценки большой задачи не обновилась.')); }
      }
    }
    await refresh();
    setDialog(null);
    notify('Задача удалена.');
  }

  async function saveNote(id: string | null, title: string, content: string, isPinned: boolean) {
    if (!client || !userId) return;
    const payload = { title, content, is_pinned: isPinned };
    let savedId = id;
    if (id) {
      const { error } = await client.from('notes').update(payload).eq('id', id);
      if (error) {
        if (error.message.includes('pinned_limit_reached')) throw new UserFacingError('Можно закрепить не больше пяти заметок.');
        throw error;
      }
    } else {
      const { data, error } = await client.from('notes').insert({ ...payload, user_id: userId }).select('id').single();
      if (error) {
        if (error.message.includes('pinned_limit_reached')) throw new UserFacingError('Можно закрепить не больше пяти заметок.');
        throw error;
      }
      savedId = data.id;
    }
    await refresh();
    if (dialog?.type === 'notes') setDialog({ type: 'notes', noteId: savedId });
    notify('Заметка сохранена.');
  }

  async function deleteNote(noteId: string) {
    if (!client || !window.confirm('Удалить заметку?')) return;
    const { error } = await client.from('notes').delete().eq('id', noteId);
    if (error) { notify(safeDataError(error, 'Не удалось удалить заметку.')); return; }
    await refresh();
    setDialog({ type: 'notes', noteId: null });
    notify('Заметка удалена.');
  }

  async function saveSettings(next: UserSettings) {
    if (!client || !userId) return;
    const { error } = await client.from('user_settings').upsert({
      user_id: userId,
      timezone: next.timezone,
      week_starts_on: next.weekStartsOn,
      reminder_time: next.reminderTime,
      push_enabled: next.pushEnabled,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    await refresh();
    setDialog(null);
    notify('Настройки сохранены.');
  }

  async function saveFocusEntry(taskId: string, elapsed: number) {
    if (!client || !userId) return;
    const minutes = Math.ceil(elapsed / 60_000);
    if (minutes > 0) {
      const { error } = await client.from('time_entries').insert({
        task_id: taskId,
        user_id: userId,
        spent_minutes: minutes,
        work_date: focusEntryDate(settings),
        comment: 'Сессия фокуса',
      });
      if (error) { notify(safeDataError(error, 'Не удалось сохранить учёт времени.')); return; }
      await refresh();
      setDialog({ type: 'task-details', taskId });
      notify(`Добавлено ${formatMinutes(minutes)} работы.`);
    } else {
      setDialog({ type: 'task-details', taskId });
      notify('Сессия была короче одной минуты.');
    }
    setFocusElapsedMs(0);
  }

  const userName = String(user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Пользователь');
  const selectedTaskId = dialog && 'taskId' in dialog ? dialog.taskId : undefined;
  const selectedTask = selectedTaskId ? findTask(tasks, selectedTaskId) : undefined;

  if (!supabaseConfigured) return <MissingConfigScreen />;
  if (!authReady) return <LoadingScreen label="Проверяем сессию…" />;
  if (passwordRecovery && user) return <PasswordResetScreen busy={authBusy} error={authError} onSubmit={updateRecoveredPassword} />;
  if (!user) return <AuthScreen busy={authBusy} error={authError} message={authMessage} onResetPassword={requestPasswordReset} onSubmit={submitAuth} />;
  if (!dataReady || dataBusy) return <LoadingScreen />;

  const today = todayInTimezone(settings.timezone);
  const heading = page === 'calendar'
    ? calendarHeading(cursor, mode, settings.weekStartsOn)
    : ({ active: 'Активные задачи', completed: 'Выполненные', stats: 'Статистика' } as const)[page];

  return (
    <div className="app-shell">
      <Sidebar
        activePage={page}
        notes={notes}
        onNavigate={setPage}
        onOpenNotes={(noteId) => setDialog({ type: 'notes', noteId: noteId ?? null })}
        onOpenSettings={() => setDialog({ type: 'settings' })}
        onSignOut={signOut}
        settings={settings}
        tasks={tasks}
        userName={userName}
      />

      <main className="main-content">
        <header className="page-header">
          <div className="page-heading-copy">
            <span className="header-eyebrow">{page === 'calendar' ? 'ВАШ ПЛАН' : 'ОБЗОР ПРОЕКТА'}</span>
            <h1>{heading}</h1>
          </div>
          {page !== 'calendar' && (
            <button className="primary-button header-add-button" onClick={() => setDialog({ type: 'task-form', date: today })} type="button">
              <Plus size={17} />Новая задача
            </button>
          )}
          <button className="icon-button mobile-account-button" onClick={signOut} type="button" aria-label="Выйти из аккаунта">
            <LogOut size={17} />
          </button>
        </header>

        {dataError && (
          <div className="data-error-banner" role="alert">
            <AlertCircle size={17} /><span>{dataError}</span>
            <button className="text-button" onClick={() => void refresh(true)} type="button"><RefreshCw size={14} />Повторить</button>
          </div>
        )}

        {page === 'calendar' && (
          <CalendarView
            cursor={cursor}
            mode={mode}
            onCreate={(deadline) => setDialog({ type: 'task-form', date: deadline })}
            onNavigate={(direction) => setCursor((current) => {
              const next = new Date(current);
              if (mode === 'month') next.setMonth(next.getMonth() + direction, 1);
              else next.setDate(next.getDate() + direction * (mode === 'week' ? 7 : 1));
              return next;
            })}
            onSelectDate={(date) => { setCursor(date); setMode('day'); }}
            onSelectTask={(taskId) => setDialog({ type: 'task-details', taskId })}
            onSetMode={setMode}
            onToday={() => setCursor(new Date())}
            settings={settings}
            tasks={tasks}
          />
        )}
        {page === 'active' && <ActiveTasksView onSelectTask={(taskId) => setDialog({ type: 'task-details', taskId })} onReopen={reopenTask} settings={settings} tasks={tasks} />}
        {page === 'completed' && <CompletedTasksView onReopen={reopenTask} onSelectTask={(taskId) => setDialog({ type: 'task-details', taskId })} settings={settings} tasks={tasks} />}
        {page === 'stats' && <StatsView onReopen={reopenTask} onSelectTask={(taskId) => setDialog({ type: 'task-details', taskId })} settings={settings} tasks={tasks} />}

        <footer className="app-footer"><span>Идём шаг за шагом.</span><span>Ваше время — ваш ресурс.</span></footer>
      </main>

      {dataBusy && <div className="sync-indicator"><RefreshCw size={14} className="spin-icon" />Синхронизация</div>}
      {toastMessage && <div className="toast-message" role="status">{toastMessage}</div>}

      {dialog?.type === 'task-form' && (
        <TaskFormDialog
          initialDate={dialog.date}
          onClose={() => setDialog(null)}
          onSave={saveTask}
          parentDeadline={selectedTask?.parentTaskId ? findTask(tasks, selectedTask.parentTaskId)?.deadline : undefined}
          settings={settings}
          task={selectedTask ?? null}
        />
      )}
      {dialog?.type === 'task-details' && selectedTask && (
        <TaskDetailsDialog
          onAddEntry={() => setDialog({ type: 'entry-form', taskId: selectedTask.id })}
          onClose={() => setDialog(null)}
          onComplete={() => void completeTask(selectedTask)}
          onDelete={() => void deleteTask(selectedTask)}
          onDeleteEntry={(entryId) => void deleteEntry(selectedTask.id, entryId)}
          onEdit={() => setDialog({ type: 'task-form', taskId: selectedTask.id })}
          onEditEntry={(entryId) => setDialog({ type: 'entry-form', taskId: selectedTask.id, entryId })}
          onFocus={() => { setFocusElapsedMs(0); setFocusRunning(true); setDialog({ type: 'focus', taskId: selectedTask.id }); }}
          onReopen={() => void reopenTask(selectedTask.id)}
          onSelectSubtask={(subtaskId) => setDialog({ type: 'task-details', taskId: subtaskId })}
          settings={settings}
          task={selectedTask}
        />
      )}
      {dialog?.type === 'entry-form' && selectedTask && (
        <EntryFormDialog
          entry={dialog.entryId ? dateForEntry(selectedTask, dialog.entryId) : null}
          onClose={() => setDialog({ type: 'task-details', taskId: selectedTask.id })}
          onSave={saveEntry}
          today={today}
        />
      )}
      {dialog?.type === 'notes' && (
        <NotesDialog
          key={dialog.noteId ?? 'new-note'}
          notes={notes}
          onClose={() => setDialog(null)}
          onDelete={(noteId) => void deleteNote(noteId)}
          onSave={saveNote}
          onSelect={(noteId) => setDialog({ type: 'notes', noteId })}
          selectedId={dialog.noteId}
        />
      )}
      {dialog?.type === 'settings' && (
        <SettingsDialog onClose={() => setDialog(null)} onSave={saveSettings} settings={settings} />
      )}
      {dialog?.type === 'focus' && selectedTask && (
        <FocusDialog
          elapsedMs={focusElapsedMs}
          onFinish={(elapsed) => void saveFocusEntry(selectedTask.id, elapsed)}
          onPause={(elapsed) => { setFocusElapsedMs(elapsed); setFocusRunning(false); }}
          onResume={(elapsed) => { setFocusElapsedMs(elapsed); setFocusRunning(true); }}
          running={focusRunning}
          task={selectedTask}
        />
      )}
    </div>
  );
}

function findTask(tasks: Task[], taskId: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === taskId) return task;
    const child = findTask(task.subtasks, taskId);
    if (child) return child;
  }
  return undefined;
}
