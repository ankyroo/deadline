'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { addDays, dateFromKey, dateKey, formatDate, timestampDateKey, todayInTimezone } from './date-utils';
import { formatMinutes, priorityLabel, taskCalculation } from './task-utils';
import type { Task, UserSettings } from './types';

const priorityOrder = { high: 0, medium: 1, low: 2 };

interface TaskViewsProps {
  tasks: Task[];
  settings: UserSettings;
  onSelectTask: (id: string) => void;
  onReopen: (id: string) => void;
}

export function ActiveTasksView({ tasks, settings, onSelectTask }: TaskViewsProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'deadline' | 'priority' | 'progress' | 'created'>('deadline');
  const activeTasks = useMemo(() => tasks
    .filter((task) => task.status === 'active' && task.title.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
    .sort((a, b) => {
      if (sort === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sort === 'progress') return taskCalculation(b, settings).progressPct - taskCalculation(a, settings).progressPct;
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      return a.deadline.localeCompare(b.deadline);
    }), [tasks, query, sort, settings]);

  return (
    <div className="task-list-page">
      <div className="list-controls">
        <label className="search-field">
          <Search size={17} />
          <input aria-label="Поиск по задачам" onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию" value={query} />
        </label>
        <label className="sort-field">
          <span>Сортировка</span>
          <select aria-label="Сортировка задач" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}>
            <option value="deadline">По дедлайну</option>
            <option value="priority">По важности</option>
            <option value="progress">По прогрессу</option>
            <option value="created">По дате создания</option>
          </select>
        </label>
      </div>
      {activeTasks.length ? (
        <div className="task-list">
          {activeTasks.map((task) => <TaskListCard key={task.id} task={task} settings={settings} onClick={() => onSelectTask(task.id)} />)}
        </div>
      ) : (
        <div className="empty-state list-empty">
          <span className="empty-icon">✳</span>
          <strong>{query ? 'Ничего не найдено' : 'Активных задач пока нет'}</strong>
          <span>{query ? 'Попробуйте изменить запрос.' : 'Создайте задачу, чтобы добавить её в свой план.'}</span>
        </div>
      )}
    </div>
  );
}

export function CompletedTasksView({ tasks, settings, onSelectTask, onReopen }: TaskViewsProps) {
  const completedTasks = tasks
    .filter((task) => task.status === 'completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return completedTasks.length ? (
    <div className="task-list completed-list">
      {completedTasks.map((task) => {
        const calculation = taskCalculation(task, settings);
        return (
          <article className={`completed-card priority-${task.priority}`} key={task.id}>
            <button className="completed-main" onClick={() => onSelectTask(task.id)} type="button">
              <span className="completed-check">✓</span>
              <span className="completed-copy">
                  <strong>{task.subtasks.length > 0 && <i className="large-task-dot" aria-label="Есть подзадачи" />} {task.title}</strong>
                <span>
                  {task.completedAt ? `Завершена ${formatDate(timestampDateKey(task.completedAt, settings.timezone))}` : 'Завершена'}
                  <span className="dot-separator">·</span> оценка {formatMinutes(task.estimatedMinutes)}
                  <span className="dot-separator">·</span> потрачено {formatMinutes(calculation.spentMinutes)}
                </span>
              </span>
            </button>
            <button className="text-button reopen-button" onClick={() => onReopen(task.id)} type="button">Вернуть</button>
          </article>
        );
      })}
    </div>
  ) : (
    <div className="empty-state list-empty">
      <span className="empty-icon">✓</span>
      <strong>Здесь появятся выполненные задачи</strong>
      <span>Когда задача будет готова, отметьте её выполненной.</span>
    </div>
  );
}

export function StatsView({ tasks, settings }: TaskViewsProps) {
  const active = tasks.filter((task) => task.status === 'active');
  const completed = tasks.filter((task) => task.status === 'completed');
  const overdue = active.filter((task) => taskCalculation(task, settings).isOverdue).length;
  const allSpent = tasks.reduce((sum, task) => sum + taskCalculation(task, settings).spentMinutes, 0);
  const completedAvg = completed.length
    ? Math.round(completed.reduce((sum, task) => sum + taskCalculation(task, settings).spentMinutes, 0) / completed.length)
    : null;
  const completionRate = active.length + completed.length
    ? Math.round((completed.length / (active.length + completed.length)) * 100)
    : 0;
  const today = todayInTimezone(settings.timezone);
  const daily = Array.from({ length: 14 }, (_, index) => {
    const key = dateKey(addDays(dateFromKey(today), index - 13));
    return { label: key.slice(-2), value: minutesOnDate(tasks, key) };
  });
  const weekly = Array.from({ length: 6 }, (_, index) => {
    const end = addDays(dateFromKey(today), -7 * (5 - index));
    const start = addDays(end, -6);
    return {
      label: index === 5 ? 'эта' : `-${5 - index}н`,
      value: minutesBetween(tasks, dateKey(start), dateKey(end)),
    };
  });
  const priorities = (['low', 'medium', 'high'] as const).map((priority) => ({
    label: { low: 'Низкая', medium: 'Средняя', high: 'Высокая' }[priority],
    value: tasks.filter((task) => task.priority === priority).length,
  }));

  return (
    <div className="stats-page">
      <div className="stats-metrics">
        <Metric label="Выполнено" value={String(completed.length)} icon="✓" />
        <Metric label="Активных" value={String(active.length)} icon="↗" />
        <Metric label="Просрочено" value={String(overdue)} icon="!" accent={overdue > 0} />
        <Metric label="Всего работы" value={formatMinutes(allSpent)} icon="◷" />
        <Metric label="В среднем на задачу" value={completedAvg === null ? '—' : formatMinutes(completedAvg)} icon="≈" />
        <Metric label="Доля выполненных" value={`${completionRate}%`} icon="◒" />
      </div>

      <div className="stats-chart-grid">
        <ChartCard title="Время по дням" caption="Последние 14 дней" items={daily} formatValue={formatMinutes} />
        <ChartCard title="Работа по неделям" caption="Последние 6 недель" items={weekly} formatValue={formatMinutes} />
        <ChartCard title="Задачи по важности" caption="Все задачи" items={priorities} formatValue={(value) => `${value} шт.`} />
      </div>
      <p className="stats-note"><ArrowUpRight size={15} /> Учёт времени помогает точнее оценивать будущие задачи.</p>
    </div>
  );
}

function TaskListCard({ task, settings, onClick }: { task: Task; settings: UserSettings; onClick: () => void }) {
  const calculation = taskCalculation(task, settings);
  return (
    <button className={`task-list-card priority-${task.priority}`} onClick={onClick} type="button">
      <span className="task-list-indicator" />
      <span className="task-list-content">
        <span className="task-list-title-row">
          <strong>{task.subtasks.length > 0 && <i className="large-task-dot" aria-label="Есть подзадачи" />} {task.title}</strong>
          <span className={`risk-badge risk-${calculation.risk}`}>
            {calculation.isOverdue ? 'Просрочена' : !calculation.scheduleConfigured ? 'Нет расписания' : calculation.shortageMinutes ? `Не хватает ${formatMinutes(calculation.shortageMinutes)}` : `${formatMinutes(calculation.minutesPerWorkday)} за день работы`}
          </span>
        </span>
        <span className="task-list-meta">
          До {formatDate(task.deadline)} <span className="dot-separator">·</span> осталось {formatMinutes(calculation.remainingMinutes)}
          <span className="dot-separator">·</span> {priorityLabel(task.priority)}
        </span>
        <span className="progress-track"><span style={{ width: `${calculation.progressPct}%` }} /></span>
      </span>
      <ArrowUpRight className="task-open-icon" size={18} />
    </button>
  );
}

function Metric({ label, value, icon, accent = false }: { label: string; value: string; icon: string; accent?: boolean }) {
  return (
    <article className={`metric-card ${accent ? 'metric-alert' : ''}`}>
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ChartCard({
  title, caption, items, formatValue,
}: {
  title: string;
  caption: string;
  items: Array<{ label: string; value: number }>;
  formatValue: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <article className="chart-card">
      <div className="chart-card-heading">
        <div><strong>{title}</strong><span>{caption}</span></div>
        <span className="chart-menu" aria-hidden="true">···</span>
      </div>
      <div className="bar-chart" role="img" aria-label={`${title}: ${items.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')}`}>
        {items.map((item, index) => (
          <div className="chart-column" key={`${item.label}-${index}`} title={`${item.label}: ${formatValue(item.value)}`}>
            <span className="chart-bar" style={{ height: `${Math.max(item.value > 0 ? 8 : 3, (item.value / max) * 100)}%` }} />
            <small>{item.label}</small>
          </div>
        ))}
      </div>
      <div className="chart-total"><span>Итого</span><strong>{formatValue(items.reduce((sum, item) => sum + item.value, 0))}</strong></div>
    </article>
  );
}

function minutesOnDate(tasks: Task[], date: string): number {
  return tasks.reduce((sum, task) => sum + task.entries
    .filter((entry) => entry.workDate === date)
    .reduce((entrySum, entry) => entrySum + entry.spentMinutes, 0), 0);
}

function minutesBetween(tasks: Task[], from: string, to: string): number {
  return tasks.reduce((sum, task) => sum + task.entries
    .filter((entry) => entry.workDate >= from && entry.workDate <= to)
    .reduce((entrySum, entry) => entrySum + entry.spentMinutes, 0), 0);
}
