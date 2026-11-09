'use client';

import { ArrowRight, Plus } from 'lucide-react';
import { addDays, dateKey, MONTHS_RU, startOfWeek, todayInTimezone, WEEKDAYS_RU } from './date-utils';
import { formatMinutes, taskCalculation } from './task-utils';
import type { CalendarMode, Task, UserSettings } from './types';
import { workWindowsForDate } from '@/lib/calculations/schedule';

interface CalendarViewProps {
  tasks: Task[];
  settings: UserSettings;
  cursor: Date;
  mode: CalendarMode;
  onCreate: (deadline?: string) => void;
  onSelectTask: (id: string) => void;
  onSelectDate: (date: Date) => void;
  onSetMode: (mode: CalendarMode) => void;
  onNavigate: (direction: -1 | 1) => void;
  onToday: () => void;
}

export function CalendarView({
  tasks, settings, cursor, mode, onCreate, onSelectTask, onSelectDate, onSetMode, onNavigate, onToday,
}: CalendarViewProps) {
  const activeTasks = tasks.filter((task) => task.status === 'active');
  const today = todayInTimezone(settings.timezone);
  const weekStartsOn = settings.weekStartsOn;
  const weekdays = Array.from({ length: 7 }, (_, index) => WEEKDAYS_RU[(weekStartsOn + index) % 7]);
  const taskWindowsOnDate = (task: Task, key: string) => {
    const windows = task.subtasks.length
      ? task.subtasks.flatMap((child) => key <= child.deadline && key <= task.deadline ? workWindowsForDate(child.weeklyAvailability, key) : [])
      : key <= task.deadline ? workWindowsForDate(task.weeklyAvailability, key) : [];
    return [...new Map(windows.map((window) => [`${window.start}-${window.end}`, window])).values()];
  };
  const tasksByDate = (key: string) => activeTasks.filter((task) => task.deadline === key || (key >= today && task.deadline > key && taskWindowsOnDate(task, key).length > 0));
  const heading = calendarHeading(cursor, mode, weekStartsOn);

  function taskChip(task: Task, key: string) {
    const calculation = taskCalculation(task, settings);
    const windows = taskWindowsOnDate(task, key);
    return (
      <button
        className={`calendar-task priority-${task.priority}`}
        key={task.id}
        onClick={(event) => { event.stopPropagation(); onSelectTask(task.id); }}
        title={`${task.title}${windows.length ? ` · ${windows.map((window) => `${window.start}–${window.end}`).join(', ')}` : ' · дедлайн'}`}
        type="button"
      >
        <span className="task-chip-title">{task.subtasks.length > 0 && <i className="large-task-dot" aria-label="Большая задача" />} {task.title}</span>
        {windows.length > 0 && <span className="task-chip-time">{windows.map((window) => `${window.start}–${window.end}`).join(', ')}</span>}
        <span className="task-chip-progress"><span style={{ width: `${calculation.progressPct}%` }} /></span>
      </button>
    );
  }

  return (
    <section className="calendar-view" aria-label="Календарь задач">
      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button className="icon-button" type="button" onClick={() => onNavigate(-1)} aria-label="Назад">
            <ArrowRight className="flip-icon" size={18} />
          </button>
          <button className="today-button" type="button" onClick={onToday}>Сегодня</button>
          <button className="icon-button" type="button" onClick={() => onNavigate(1)} aria-label="Вперёд">
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="calendar-controls">
          <div className="segmented-control" aria-label="Режим календаря">
            {(['month', 'week', 'day'] as const).map((item) => (
              <button
                aria-pressed={mode === item}
                className={mode === item ? 'is-selected' : ''}
                key={item}
                onClick={() => onSetMode(item)}
                type="button"
              >
                {{ month: 'Месяц', week: 'Неделя', day: 'День' }[item]}
              </button>
            ))}
          </div>
          <button className="primary-button add-task-button" type="button" onClick={() => onCreate(dateKey(cursor))}>
            <Plus size={17} />
            <span>Новая задача</span>
          </button>
        </div>
      </div>

      {mode === 'month' && (
        <div className="month-calendar">
          <div className="weekday-row">
            {weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="month-grid">
            {monthDates(cursor, weekStartsOn).map((date) => {
              const key = dateKey(date);
              const items = tasksByDate(key);
              return (
                <button
                  className={`day-cell ${date.getMonth() !== cursor.getMonth() ? 'is-outside' : ''} ${key === today ? 'is-today' : ''}`}
                  key={key}
                  onClick={() => onSelectDate(date)}
                  type="button"
                >
                  <span className="day-number">{date.getDate()}</span>
                  <span className="day-task-list">{items.slice(0, 2).map((task) => taskChip(task, key))}</span>
                  {items.length > 2 && (
                    <span className="more-tasks" onClick={(event) => { event.stopPropagation(); onSelectDate(date); }}>
                      Ещё {items.length - 2}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'week' && (
        <div className="week-grid">
          {weekDates(cursor, weekStartsOn).map((date) => {
            const key = dateKey(date);
            const items = tasksByDate(key);
            return (
              <div className={`week-day ${key === today ? 'is-today' : ''}`} key={key}>
                <button className="week-day-heading" onClick={() => onSelectDate(date)} type="button">
                  <span>{WEEKDAYS_RU[date.getDay()]}</span>
                  <strong>{date.getDate()}</strong>
                </button>
                <div className="week-task-list">
                  {items.length ? items.map((task) => taskChip(task, key)) : <span className="week-empty">Свободно</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'day' && (
        <div className="day-agenda">
          <div className="agenda-date">
            <span>{WEEKDAYS_RU[cursor.getDay()]}</span>
            <strong>{cursor.getDate()}</strong>
            <span>{MONTHS_RU[cursor.getMonth()]}</span>
          </div>
          <div className="agenda-items">
            {tasksByDate(dateKey(cursor)).length ? tasksByDate(dateKey(cursor)).map((task) => {
              const calculation = taskCalculation(task, settings);
              return (
                <button className={`agenda-task priority-${task.priority}`} key={task.id} onClick={() => onSelectTask(task.id)} type="button">
                  <div className="agenda-task-top">
                    <strong>{task.subtasks.length > 0 && <i className="large-task-dot" aria-label="Большая задача" />} {task.title}</strong>
                    <span className={`risk-badge risk-${calculation.risk}`}>
                      {calculation.isOverdue ? 'Просрочена' : calculation.risk === 'ok' ? 'Успеваете' : calculation.risk === 'warn' ? 'Нагрузка выше нормы' : 'Есть риск'}
                    </span>
                  </div>
              <p>Осталось {formatMinutes(calculation.remainingMinutes)} <span>·</span> {taskWindowsOnDate(task, dateKey(cursor)).length ? `время ${taskWindowsOnDate(task, dateKey(cursor)).map((window) => `${window.start}–${window.end}`).join(', ')}` : `в среднем ${formatMinutes(calculation.minutesPerWorkday)} за день работы`}</p>
                  <span className="progress-track"><span style={{ width: `${calculation.progressPct}%` }} /></span>
                </button>
              );
            }) : (
              <div className="empty-state">
                <span className="empty-icon">✳</span>
                <strong>На этот день задач нет</strong>
                <span>Добавьте дедлайн и спланируйте работу заранее.</span>
                <button className="secondary-button" onClick={() => onCreate(dateKey(cursor))} type="button"><Plus size={16} />Добавить задачу</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="calendar-footer">
        <span>Планируйте в своём темпе</span>
        <button className="text-button" type="button" onClick={() => onSetMode('week')}>Посмотреть неделю <ArrowRight size={14} /></button>
        <span className="calendar-heading-sr">{heading}</span>
      </div>
    </section>
  );
}

export function calendarHeading(date: Date, mode: CalendarMode, weekStartsOn: 0 | 1): string {
  if (mode === 'month') return `${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;
  if (mode === 'day') return `${date.getDate()} ${MONTHS_RU[date.getMonth()].toLocaleLowerCase('ru-RU')} ${date.getFullYear()}`;
  const start = startOfWeek(date, weekStartsOn);
  const end = addDays(start, 6);
  const short = (value: Date) => `${value.getDate()} ${MONTHS_RU[value.getMonth()].slice(0, 3).toLocaleLowerCase('ru-RU')}`;
  return `${short(start)} — ${short(end)} ${end.getFullYear()}`;
}

function monthDates(date: Date, weekStartsOn: 0 | 1): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekDates(date: Date, weekStartsOn: 0 | 1): Date[] {
  const start = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
