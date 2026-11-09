'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Archive,
  CalendarDays,
  Check,
  CirclePlay,
  Clock3,
  FileText,
  Flag,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { formatDate, todayInTimezone } from './date-utils';
import { formatMinutes, priorityLabel, riskLabel, taskCalculation } from './task-utils';
import type { EntryFormValues, Note, Task, TaskFormValues, UserSettings } from './types';
import { safeDataError } from '@/lib/supabase/safe-errors';
import { calculateScheduleCapacity, validWindow, WEEKDAY_KEYS, type WeeklyAvailability, type WeekdayKey } from '@/lib/calculations/schedule';

type SubtaskDraft = Omit<TaskFormValues, 'subtasks' | 'parentTaskId'>;
const WEEKDAY_NAMES: Record<WeekdayKey, string> = {
  mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс',
};

function emptySubtask(deadline: string): SubtaskDraft {
  return { title: '', description: '', deadline, estimatedMinutes: 0, priority: 'medium', weeklyAvailability: {} };
}

function ScheduleEditor({ value, onChange }: { value: WeeklyAvailability; onChange: (next: WeeklyAvailability) => void }) {
  return (
    <fieldset className="schedule-fieldset">
      <legend>Когда вы сможете заниматься</legend>
      <div className="schedule-days">
        {WEEKDAY_KEYS.map((day) => {
          const window = value[day];
          return (
            <div className={`schedule-day ${window ? 'is-enabled' : ''}`} key={day}>
              <label className="schedule-day-toggle">
                <input checked={Boolean(window)} onChange={(event) => {
                  const next = { ...value };
                  if (event.target.checked) next[day] = { start: '18:00', end: '20:00' };
                  else delete next[day];
                  onChange(next);
                }} type="checkbox" />
                <span>{WEEKDAY_NAMES[day]}</span>
              </label>
              {window && <div className="schedule-times">
                <input aria-label={`${WEEKDAY_NAMES[day]} начало`} onChange={(event) => onChange({ ...value, [day]: { ...window, start: event.target.value } })} type="time" value={window.start} />
                <span>—</span>
                <input aria-label={`${WEEKDAY_NAMES[day]} окончание`} onChange={(event) => onChange({ ...value, [day]: { ...window, end: event.target.value } })} type="time" value={window.end} />
              </div>}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function AvailabilityMessage({ estimatedMinutes, deadline, schedule, settings }: {
  estimatedMinutes: number;
  deadline: string;
  schedule: WeeklyAvailability;
  settings: UserSettings;
}) {
  const today = todayInTimezone(settings.timezone);
  const capacity = calculateScheduleCapacity(schedule, today, deadline, settings.timezone);
  if (!capacity.configured) return <p className="form-message availability-hint">Выберите хотя бы один день и укажите доступное время.</p>;
  if (WEEKDAY_KEYS.some((day) => schedule[day] && !validWindow(schedule[day]))) return <p className="form-message form-error">Время окончания должно быть позже времени начала.</p>;
  const shortage = Math.max(0, estimatedMinutes - capacity.availableMinutes);
  if (shortage) return <p className="form-message availability-warning" role="status">До дедлайна доступно {formatMinutes(capacity.availableMinutes)}, нужно {formatMinutes(estimatedMinutes)} — не хватает {formatMinutes(shortage)}.</p>;
  return <p className="form-message availability-ok" role="status">Времени достаточно: доступно {formatMinutes(capacity.availableMinutes)} из {formatMinutes(estimatedMinutes)}.</p>;
}

function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-modal="true" className={`modal-panel ${wide ? 'modal-wide' : ''}`} role="dialog">
        {children}
      </section>
    </div>
  );
}

function DialogHeading({ eyebrow, title, onClose }: { eyebrow?: string; title: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-heading">
      <div>{eyebrow && <span className="dialog-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
      <button className="icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
    </div>
  );
}

function keepFocusOpen() {}

export function TaskFormDialog({
  task, initialDate, settings, parentDeadline, onClose, onSave,
}: {
  task: Task | null;
  initialDate?: string;
  settings: UserSettings;
  parentDeadline?: string;
  onClose: () => void;
  onSave: (values: TaskFormValues) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [deadline, setDeadline] = useState(task?.deadline ?? initialDate ?? todayInTimezone(settings.timezone));
  const [hours, setHours] = useState(task && !task.subtasks.length ? String(Math.floor(task.estimatedMinutes / 60)) : '');
  const [minutes, setMinutes] = useState(task && !task.subtasks.length ? String(task.estimatedMinutes % 60) : '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'medium');
  const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailability>(task?.weeklyAvailability ?? {});
  const [isLarge, setIsLarge] = useState(Boolean(task?.subtasks.length));
  const [subtaskCount, setSubtaskCount] = useState(String(Math.max(2, task?.subtasks.length ?? 2)));
  const [subtaskIndex, setSubtaskIndex] = useState<number | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>(() => task?.subtasks.map((child) => ({
    title: child.title,
    description: child.description,
    deadline: child.deadline,
    estimatedMinutes: child.estimatedMinutes,
    priority: child.priority,
    weeklyAvailability: child.weeklyAvailability,
  })) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = todayInTimezone(settings.timezone);
  const existingGroup = Boolean(task?.subtasks.length);
  const isSubtaskEdit = Boolean(task?.parentTaskId);
  const latestSubtaskDeadline = task?.subtasks.reduce((latest, child) => child.deadline > latest ? child.deadline : latest, task.deadline);
  const currentSubtask = subtaskIndex === null ? null : subtasks[subtaskIndex] ?? emptySubtask(deadline);
  const currentSubtaskHours = currentSubtask ? Math.floor(currentSubtask.estimatedMinutes / 60) : 0;
  const currentSubtaskMinutes = currentSubtask ? currentSubtask.estimatedMinutes % 60 : 0;

  function patchCurrentSubtask(patch: Partial<SubtaskDraft>) {
    if (subtaskIndex === null) return;
    setSubtasks((current) => {
      const next = [...current];
      next[subtaskIndex] = { ...(next[subtaskIndex] ?? emptySubtask(deadline)), ...patch };
      return next;
    });
  }

  function childEstimate(child: SubtaskDraft): number {
    return Math.max(0, Number(child.estimatedMinutes) || 0);
  }

  async function saveRegular(estimatedMinutes: number, schedule: WeeklyAvailability) {
    if (!estimatedMinutes) { setError('Укажите оценку времени больше нуля.'); return; }
    if (!Object.keys(schedule).length && !existingGroup) { setError('Выберите дни и время для работы над задачей.'); return; }
    if (WEEKDAY_KEYS.some((day) => schedule[day] && !validWindow(schedule[day]))) { setError('Время окончания должно быть позже времени начала.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave({
        title: title.trim(), description: description.trim(), deadline, estimatedMinutes, priority,
        weeklyAvailability: schedule, parentTaskId: task?.parentTaskId ?? null,
      });
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  function beginSubtasks() {
    if (!title.trim()) { setError('Укажите название большой задачи.'); return; }
    if (!deadline) { setError('Укажите дедлайн большой задачи.'); return; }
    const count = Math.min(20, Math.max(2, Number(subtaskCount) || 2));
    setSubtaskCount(String(count));
    setSubtasks(Array.from({ length: count }, (_, index) => subtasks[index] ?? emptySubtask(deadline)));
    setSubtaskIndex(0);
    setError('');
  }

  async function saveLargeTask() {
    if (subtaskIndex === null) return;
    const child = subtasks[subtaskIndex] ?? emptySubtask(deadline);
    if (!child.title.trim()) { setError(`Укажите название подзадачи ${subtaskIndex + 1}.`); return; }
    if (!childEstimate(child)) { setError(`Добавьте оценку времени для подзадачи ${subtaskIndex + 1}.`); return; }
    if (!Object.keys(child.weeklyAvailability).length) { setError(`Выберите дни и время для подзадачи ${subtaskIndex + 1}.`); return; }
    if (WEEKDAY_KEYS.some((day) => child.weeklyAvailability[day] && !validWindow(child.weeklyAvailability[day]))) { setError('Время окончания должно быть позже времени начала.'); return; }
    const completedDrafts = [...subtasks];
    completedDrafts[subtaskIndex] = child;
    setSubtasks(completedDrafts);
    if (subtaskIndex < Number(subtaskCount) - 1) {
      setSubtaskIndex(subtaskIndex + 1);
      setError('');
      return;
    }
    const estimatedMinutes = completedDrafts.reduce((sum, item) => sum + childEstimate(item), 0);
    setBusy(true);
    setError('');
    try {
      await onSave({
        title: title.trim(), description: description.trim(), deadline, estimatedMinutes, priority,
        weeklyAvailability: {}, parentTaskId: null, subtasks: completedDrafts,
      });
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (subtaskIndex !== null) { await saveLargeTask(); return; }
    if (isLarge) {
      if (existingGroup) {
        const estimatedMinutes = task?.subtasks.reduce((sum, child) => sum + child.estimatedMinutes, 0) ?? 0;
        await saveRegular(estimatedMinutes, {});
      } else beginSubtasks();
      return;
    }
    const estimatedMinutes = Math.max(0, Number(hours) || 0) * 60 + Math.max(0, Number(minutes) || 0);
    await saveRegular(estimatedMinutes, weeklyAvailability);
  }

  return (
    <Modal onClose={onClose} wide>
      <DialogHeading eyebrow={subtaskIndex !== null ? `БОЛЬШАЯ ЗАДАЧА · ПОДЗАДАЧА ${subtaskIndex + 1} ИЗ ${subtaskCount}` : task ? 'ИЗМЕНИТЬ ЗАДАЧУ' : 'НОВЫЙ ПЛАН'} title={subtaskIndex !== null ? `Подзадача ${subtaskIndex + 1}` : task ? 'Редактирование' : 'Новая задача'} onClose={onClose} />
      <form className="dialog-form" onSubmit={submit}>
        {subtaskIndex === null ? <>
          <label className="field-label"><span>Название задачи</span><input autoFocus maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Например, подготовить проект" required value={title} /></label>
          <label className="field-label"><span>Описание <small>необязательно</small></span><textarea maxLength={4000} onChange={(event) => setDescription(event.target.value)} placeholder="Добавьте детали или контекст" rows={3} value={description} /></label>
          <div className="form-row">
            <label className="field-label"><span>Дедлайн</span><input max={isSubtaskEdit ? parentDeadline : undefined} min={existingGroup ? latestSubtaskDeadline : task ? undefined : today} onChange={(event) => setDeadline(event.target.value)} required type="date" value={deadline} /></label>
            {!isLarge && <div className="field-label"><span>Оценка времени</span><div className="form-row time-estimate-row">
              <label className="number-with-unit"><input aria-label="Часы" min="0" onChange={(event) => setHours(event.target.value)} placeholder="0" type="number" value={hours} /><span>часов</span></label>
              <label className="number-with-unit"><input aria-label="Минуты" max="59" min="0" onChange={(event) => setMinutes(event.target.value)} placeholder="0" type="number" value={minutes} /><span>минут</span></label>
            </div></div>}
          </div>
          {!isSubtaskEdit && <label className="large-task-toggle"><input checked={isLarge} disabled={Boolean(task)} onChange={(event) => setIsLarge(event.target.checked)} type="checkbox" /><span><strong>Большая задача</strong><small>{task ? existingGroup ? 'Состав группы сохранён' : 'Включается при создании задачи' : 'Разбить на самостоятельные подзадачи'}</small></span></label>}
          {isLarge && !existingGroup && <label className="field-label"><span>Количество подзадач <small>от 2 до 20</small></span><input max="20" min="2" onChange={(event) => setSubtaskCount(event.target.value)} type="number" value={subtaskCount} />{(Number(subtaskCount) < 2 || Number(subtaskCount) > 20) && <small>Выберите от 2 до 20 подзадач.</small>}</label>}
          {existingGroup && <div className="subtask-summary">В этой задаче {task?.subtasks.length} подзадач. Их расписание и оценку можно изменить отдельно.</div>}
          {!isLarge && <ScheduleEditor onChange={setWeeklyAvailability} value={weeklyAvailability} />}
          {!isLarge && <AvailabilityMessage deadline={deadline} estimatedMinutes={Math.max(0, Number(hours) || 0) * 60 + Math.max(0, Number(minutes) || 0)} schedule={weeklyAvailability} settings={settings} />}
          <fieldset className="priority-fieldset">
            <legend>Важность</legend>
            <div className="priority-options">
              {(['low', 'medium', 'high'] as const).map((value) => (
                <button aria-pressed={priority === value} className={`priority-choice priority-${value} ${priority === value ? 'is-selected' : ''}`} key={value} onClick={() => setPriority(value)} type="button">
                  <span />{priorityLabel(value)}
                </button>
              ))}
            </div>
          </fieldset>
        </> : currentSubtask && <>
          <label className="field-label"><span>Название подзадачи</span><input autoFocus maxLength={120} onChange={(event) => patchCurrentSubtask({ title: event.target.value })} placeholder="Например, собрать материалы" required value={currentSubtask.title} /></label>
          <label className="field-label"><span>Описание <small>необязательно</small></span><textarea maxLength={4000} onChange={(event) => patchCurrentSubtask({ description: event.target.value })} placeholder="Добавьте детали или контекст" rows={3} value={currentSubtask.description} /></label>
          <div className="form-row">
            <label className="field-label"><span>Дедлайн</span><input max={deadline} min={today} onChange={(event) => patchCurrentSubtask({ deadline: event.target.value })} required type="date" value={currentSubtask.deadline} /></label>
            <div className="field-label"><span>Оценка времени</span><div className="form-row time-estimate-row">
              <label className="number-with-unit"><input aria-label="Часы подзадачи" min="0" onChange={(event) => patchCurrentSubtask({ estimatedMinutes: (Number(event.target.value) || 0) * 60 + currentSubtaskMinutes })} placeholder="0" type="number" value={currentSubtaskHours || ''} /><span>часов</span></label>
              <label className="number-with-unit"><input aria-label="Минуты подзадачи" max="59" min="0" onChange={(event) => patchCurrentSubtask({ estimatedMinutes: currentSubtaskHours * 60 + (Number(event.target.value) || 0) })} placeholder="0" type="number" value={currentSubtaskMinutes || ''} /><span>минут</span></label>
            </div></div>
          </div>
          <ScheduleEditor onChange={(next) => patchCurrentSubtask({ weeklyAvailability: next })} value={currentSubtask.weeklyAvailability} />
          <AvailabilityMessage deadline={currentSubtask.deadline} estimatedMinutes={currentSubtask.estimatedMinutes} schedule={currentSubtask.weeklyAvailability} settings={settings} />
          <fieldset className="priority-fieldset"><legend>Важность</legend><div className="priority-options">
            {(['low', 'medium', 'high'] as const).map((value) => <button aria-pressed={currentSubtask.priority === value} className={`priority-choice priority-${value} ${currentSubtask.priority === value ? 'is-selected' : ''}`} key={value} onClick={() => patchCurrentSubtask({ priority: value })} type="button"><span />{priorityLabel(value)}</button>)}
          </div></fieldset>
        </>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          {subtaskIndex !== null && <button className="secondary-button" onClick={() => { setSubtaskIndex(subtaskIndex === 0 ? null : subtaskIndex - 1); setError(''); }} type="button">Назад</button>}
          {subtaskIndex === null && <button className="secondary-button" onClick={onClose} type="button">Отмена</button>}
          {subtaskIndex !== null && subtaskIndex < Number(subtaskCount) - 1
            ? <button className="primary-button" disabled={busy} type="submit">Далее</button>
            : <button className="primary-button" disabled={busy || (subtaskIndex === null && isLarge && !existingGroup && (Number(subtaskCount) < 2 || Number(subtaskCount) > 20))} type="submit">{busy ? 'Сохраняем…' : subtaskIndex !== null ? 'Создать большую задачу' : task ? 'Сохранить изменения' : isLarge ? existingGroup ? 'Сохранить задачу' : 'Перейти к подзадачам' : 'Создать задачу'}</button>}
        </div>
      </form>
    </Modal>
  );
}

export function TaskDetailsDialog({
  task, settings, onClose, onEdit, onAddEntry, onEditEntry, onDeleteEntry, onDelete, onComplete, onFocus, onReopen, onSelectSubtask,
}: {
  task: Task;
  settings: UserSettings;
  onClose: () => void;
  onEdit: () => void;
  onAddEntry: () => void;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDelete: () => void;
  onComplete: () => void;
  onFocus: () => void;
  onReopen: () => void;
  onSelectSubtask: (id: string) => void;
}) {
  const calculation = taskCalculation(task, settings);
  const active = task.status === 'active';
  const sortedEntries = [...task.entries].sort((a, b) => b.workDate.localeCompare(a.workDate));

  return (
    <Modal onClose={onClose} wide>
      <DialogHeading eyebrow={active ? task.subtasks.length ? 'БОЛЬШАЯ ЗАДАЧА' : 'АКТИВНАЯ ЗАДАЧА' : 'ЗАДАЧА ВЫПОЛНЕНА'} title={<>{task.subtasks.length > 0 && <i className="large-task-dot" aria-label="Есть подзадачи" />} {task.title}</>} onClose={onClose} />
      <div className="task-detail-meta">
        <span className={`risk-badge risk-${calculation.risk}`}>{riskLabel(calculation.risk, calculation.isOverdue)}</span>
        <span className={`priority-label priority-${task.priority}`}><i />{priorityLabel(task.priority)} важность</span>
        <button className="text-button inline-edit-button" onClick={onEdit} type="button"><Pencil size={14} /> Изменить</button>
      </div>
      {task.description && <p className="task-description">{task.description}</p>}

      <div className="detail-progress-heading"><span>Прогресс</span><strong>{calculation.progressPct}%</strong></div>
      <div className="progress-track detail-progress"><span style={{ width: `${calculation.progressPct}%` }} /></div>

      <div className="detail-metrics">
        <MetricTile icon={<CalendarDays size={16} />} label="Дедлайн" value={formatDate(task.deadline)} />
        <MetricTile icon={<Clock3 size={16} />} label="До дедлайна" value={calculation.isOverdue ? 'Срок прошёл' : `${calculation.daysRemaining} дн.`} />
        <MetricTile icon={<FileText size={16} />} label="Оценка" value={formatMinutes(task.estimatedMinutes)} />
        <MetricTile icon={<Clock3 size={16} />} label="Потрачено" value={formatMinutes(calculation.spentMinutes)} />
        <MetricTile icon={<Archive size={16} />} label="Осталось" value={formatMinutes(calculation.remainingMinutes)} sub={calculation.overspentMinutes ? `Превышение ${formatMinutes(calculation.overspentMinutes)}` : undefined} />
        <MetricTile icon={<Flag size={16} />} label="В среднем за день работы" value={formatMinutes(calculation.minutesPerWorkday)} />
      </div>

      {calculation.scheduleConfigured && calculation.shortageMinutes > 0
        ? <p className="detail-schedule-warning">До дедлайна по выбранному расписанию доступно {formatMinutes(calculation.availableMinutes)}, нужно {formatMinutes(calculation.remainingMinutes)}. Не хватает {formatMinutes(calculation.shortageMinutes)}.</p>
        : !calculation.scheduleConfigured && active && <p className="detail-schedule-warning">Расписание не задано. Измените задачу и выберите дни и время работы.</p>}

      {task.subtasks.length > 0 && <section className="subtasks-section">
        <div className="history-heading"><div><span className="dialog-eyebrow">ПЛАН РАБОТЫ</span><h3>Подзадачи</h3></div><span>{task.subtasks.filter((item) => item.status === 'completed').length} из {task.subtasks.length}</span></div>
        <div className="subtask-list">{task.subtasks.map((subtask) => (
          <button className={`subtask-row ${subtask.status === 'completed' ? 'is-complete' : ''}`} key={subtask.id} onClick={() => onSelectSubtask(subtask.id)} type="button">
            <span className="subtask-status-mark">{subtask.status === 'completed' ? '✓' : '○'}</span>
            <span className="subtask-row-copy"><strong>{subtask.title}</strong><small>До {formatDate(subtask.deadline)} · {formatMinutes(subtask.estimatedMinutes)}</small></span>
            <Pencil size={14} />
          </button>
        ))}</div>
      </section>}

      <div className="detail-actions">
        {active ? <>
          <button className="primary-button" onClick={onFocus} type="button"><CirclePlay size={17} />Начать работу</button>
          <button className="secondary-button" onClick={onAddEntry} type="button"><Plus size={17} />Добавить время</button>
          <button className="secondary-button" disabled={task.subtasks.some((subtask) => subtask.status !== 'completed')} onClick={onComplete} title={task.subtasks.some((subtask) => subtask.status !== 'completed') ? 'Сначала завершите все подзадачи' : undefined} type="button"><Check size={17} />Завершить</button>
        </> : <button className="secondary-button" onClick={onReopen} type="button"><RotateCcw size={17} />Вернуть в активные</button>}
        <button className="icon-button danger-icon" onClick={onDelete} type="button" aria-label="Удалить задачу"><Trash2 size={17} /></button>
      </div>

      <section className="history-section">
        <div className="history-heading"><div><span className="dialog-eyebrow">ИСТОРИЯ</span><h3>Учёт времени</h3></div><span>{sortedEntries.length} {pluralEntries(sortedEntries.length)}</span></div>
        {sortedEntries.length ? <div className="entry-list">{sortedEntries.map((entry) => (
          <div className="entry-row" key={entry.id}>
            <span className="entry-date">{formatDate(entry.workDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <strong>{formatMinutes(entry.spentMinutes)}</strong>
            <span className="entry-comment">{entry.comment || 'Без комментария'}</span>
            {active && <span className="entry-buttons"><button aria-label="Изменить запись" className="icon-button" onClick={() => onEditEntry(entry.id)} type="button"><Pencil size={15} /></button><button aria-label="Удалить запись" className="icon-button danger-icon" onClick={() => onDeleteEntry(entry.id)} type="button"><Trash2 size={15} /></button></span>}
          </div>
        ))}</div> : <p className="history-empty">Время ещё не записано. Добавьте первую сессию работы.</p>}
      </section>
    </Modal>
  );
}

function MetricTile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return <div className="detail-metric"><span className="detail-metric-icon">{icon}</span><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

export function EntryFormDialog({
  entry, today, onClose, onSave,
}: {
  entry: EntryFormValues | null;
  today: string;
  onClose: () => void;
  onSave: (values: EntryFormValues) => Promise<void>;
}) {
  const [hours, setHours] = useState(entry ? String(Math.floor(entry.spentMinutes / 60)) : '');
  const [minutes, setMinutes] = useState(entry ? String(entry.spentMinutes % 60) : '');
  const [workDate, setWorkDate] = useState(entry?.workDate ?? today);
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const spentMinutes = Math.max(0, Number(hours) || 0) * 60 + Math.max(0, Number(minutes) || 0);
    if (spentMinutes < 1) { setError('Добавьте хотя бы одну минуту.'); return; }
    setBusy(true);
    setError('');
    try { await onSave({ spentMinutes, workDate, comment: comment.trim() }); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <DialogHeading eyebrow="УЧЁТ РАБОТЫ" title={entry ? 'Изменить запись' : 'Добавить время'} onClose={onClose} />
      <form className="dialog-form" onSubmit={submit}>
        <div className="field-label"><span>Сколько времени</span><div className="form-row time-estimate-row">
          <label className="number-with-unit"><input aria-label="Часы" min="0" onChange={(event) => setHours(event.target.value)} placeholder="0" type="number" value={hours} /><span>часов</span></label>
          <label className="number-with-unit"><input aria-label="Минуты" max="59" min="0" onChange={(event) => setMinutes(event.target.value)} placeholder="0" type="number" value={minutes} /><span>минут</span></label>
        </div></div>
        <label className="field-label"><span>Дата работы</span><input onChange={(event) => setWorkDate(event.target.value)} required type="date" value={workDate} /></label>
        <label className="field-label"><span>Комментарий <small>необязательно</small></span><input maxLength={160} onChange={(event) => setComment(event.target.value)} placeholder="Что удалось сделать?" value={comment} /></label>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="secondary-button" onClick={onClose} type="button">Отмена</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить запись'}</button></div>
      </form>
    </Modal>
  );
}

export function NotesDialog({
  notes, selectedId, onClose, onSelect, onSave, onDelete,
}: {
  notes: Note[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onSave: (id: string | null, title: string, content: string, isPinned: boolean) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const note = notes.find((item) => item.id === selectedId) ?? null;
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [isPinned, setIsPinned] = useState(note?.isPinned ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() && !content.trim()) { setError('Добавьте заголовок или текст заметки.'); return; }
    setBusy(true);
    setError('');
    try { await onSave(note?.id ?? null, title.trim(), content, isPinned); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} wide>
      <DialogHeading eyebrow="ВАШИ МЫСЛИ И ИДЕИ" title="Заметки" onClose={onClose} />
      <div className="note-tabs">
        {notes.map((item) => (
          <button className={item.id === selectedId ? 'is-selected' : ''} key={item.id} onClick={() => onSelect(item.id)} type="button">
            {item.isPinned && <Pin size={12} fill="currentColor" />}{item.title || 'Без названия'}
          </button>
        ))}
        <button className="new-note-tab" onClick={() => onSelect(null)} type="button"><Plus size={15} />Новая</button>
      </div>
      <form className="dialog-form notes-form" onSubmit={save}>
        <label className="field-label"><span>Заголовок</span><input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Коротко о заметке" value={title} /></label>
        <label className="field-label"><span>Текст</span><textarea maxLength={20000} onChange={(event) => setContent(event.target.value)} placeholder="Запишите, что важно не забыть…" rows={7} value={content} /></label>
        <div className="note-form-footer">
          <div>
            <button className={`secondary-button pin-button ${isPinned ? 'is-pinned' : ''}`} onClick={() => setIsPinned((value) => !value)} type="button"><Pin size={15} fill={isPinned ? 'currentColor' : 'none'} />{isPinned ? 'Закреплена' : 'Закрепить'}</button>
            {note && <span className="note-dates">Обновлена {formatDate(note.updatedAt.slice(0, 10))}</span>}
          </div>
          <div className="dialog-actions"><button className="secondary-button" onClick={onClose} type="button">Закрыть</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить заметку'}</button></div>
        </div>
        {note && <button className="delete-note-button" onClick={() => onDelete(note.id)} type="button"><Trash2 size={14} />Удалить заметку</button>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

export function SettingsDialog({
  settings, onClose, onSave,
}: {
  settings: UserSettings;
  onClose: () => void;
  onSave: (settings: UserSettings) => Promise<void>;
}) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(settings.weekStartsOn);
  const [reminderTime, setReminderTime] = useState(settings.reminderTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      new Intl.DateTimeFormat('ru-RU', { timeZone: timezone.trim() || 'UTC' });
    } catch {
      setError('Укажите корректный часовой пояс, например Asia/Novosibirsk.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        timezone: timezone.trim() || 'UTC',
        weekStartsOn,
        reminderTime,
        pushEnabled: settings.pushEnabled,
      });
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <DialogHeading eyebrow="ПОД ВАШ РИТМ" title="Настройки" onClose={onClose} />
      <form className="dialog-form" onSubmit={save}>
        <fieldset className="priority-fieldset">
          <legend>Первый день недели</legend>
          <div className="priority-options week-start-options">
            <button aria-pressed={weekStartsOn === 1} className={`secondary-button ${weekStartsOn === 1 ? 'is-selected' : ''}`} onClick={() => setWeekStartsOn(1)} type="button">Понедельник</button>
            <button aria-pressed={weekStartsOn === 0} className={`secondary-button ${weekStartsOn === 0 ? 'is-selected' : ''}`} onClick={() => setWeekStartsOn(0)} type="button">Воскресенье</button>
          </div>
        </fieldset>
        <label className="field-label"><span>Часовой пояс</span><input maxLength={80} onChange={(event) => setTimezone(event.target.value)} required value={timezone} /></label>
        <label className="field-label"><span>Время напоминания <small>настройка сохранится в профиле</small></span><input onChange={(event) => setReminderTime(event.target.value)} required type="time" value={reminderTime} /></label>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="secondary-button" onClick={onClose} type="button">Отмена</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить настройки'}</button></div>
      </form>
    </Modal>
  );
}

export function FocusDialog({
  task, elapsedMs, running, onPause, onResume, onFinish,
}: {
  task: Task;
  elapsedMs: number;
  running: boolean;
  onPause: (elapsed: number) => void;
  onResume: (elapsed: number) => void;
  onFinish: (elapsed: number) => void;
}) {
  const [elapsed, setElapsed] = useState(elapsedMs);
  const [runStartedAt, setRunStartedAt] = useState(() => Date.now());
  const [localRunning, setLocalRunning] = useState(running);
  const [baseElapsed, setBaseElapsed] = useState(elapsedMs);

  useEffect(() => {
    if (!localRunning) return;
    const timer = window.setInterval(() => setElapsed(baseElapsed + Date.now() - runStartedAt), 250);
    return () => window.clearInterval(timer);
  }, [baseElapsed, localRunning, runStartedAt]);

  function toggle() {
    if (localRunning) {
      setLocalRunning(false);
      setBaseElapsed(elapsed);
      onPause(elapsed);
    } else {
      setBaseElapsed(elapsed);
      setRunStartedAt(Date.now());
      setLocalRunning(true);
      onResume(elapsed);
    }
  }

  const totalSeconds = Math.floor(elapsed / 1000);
  const timerText = [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');

  return (
    <Modal onClose={keepFocusOpen}>
      <div className="focus-dialog">
        <div className="focus-orbit"><span /><span /><span /></div>
        <span className="dialog-eyebrow">РЕЖИМ ФОКУСА</span>
        <h2>{task.title}</h2>
        <p>{localRunning ? 'Выделите время только для этой задачи.' : 'Таймер на паузе. Продолжите, когда будете готовы.'}</p>
        <div className="focus-timer" aria-live="off">{timerText}</div>
        <div className="focus-session-note"><span className={`focus-live-dot ${localRunning ? 'is-running' : ''}`} />{localRunning ? 'Сессия идёт' : 'Пауза'}</div>
        <div className="focus-actions">
          <button className="secondary-button" onClick={toggle} type="button">{localRunning ? 'Пауза' : 'Продолжить'}</button>
          <button className="primary-button" onClick={() => onFinish(elapsed)} type="button"><Check size={17} />Завершить сессию</button>
        </div>
      </div>
    </Modal>
  );
}

export function MissingConfigScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <span className="setup-icon"><FileText size={22} /></span>
        <span className="dialog-eyebrow">НАСТРОЙКА ПРОЕКТА</span>
        <h1>Подключите Supabase</h1>
        <p>Добавьте URL проекта и публичный ключ Supabase в локальный файл окружения, затем перезапустите приложение.</p>
        <div className="setup-code"><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></div>
        <span className="setup-footnote">Не вставляйте секретный service role key в клиентское приложение.</span>
      </section>
    </main>
  );
}

export function LoadingScreen({ label = 'Загружаем ваше пространство…' }: { label?: string }) {
  return <main className="loading-page"><span className="loading-mark"><span /></span><span>{label}</span></main>;
}

export function dateForEntry(task: Task, entryId: string): EntryFormValues | null {
  const entry = task.entries.find((item) => item.id === entryId);
  return entry ? { spentMinutes: entry.spentMinutes, workDate: entry.workDate, comment: entry.comment } : null;
}

export function focusEntryDate(settings: UserSettings): string {
  return todayInTimezone(settings.timezone);
}

function errorText(error: unknown): string {
  return safeDataError(error, 'Не удалось сохранить изменения. Попробуйте ещё раз.');
}

function pluralEntries(count: number): string {
  const tail = count % 10;
  const rest = count % 100;
  if (tail === 1 && rest !== 11) return 'запись';
  if ([2, 3, 4].includes(tail) && ![12, 13, 14].includes(rest)) return 'записи';
  return 'записей';
}
