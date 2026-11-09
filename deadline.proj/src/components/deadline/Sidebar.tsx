'use client';

import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckCheck,
  ListTodo,
  LogOut,
  NotebookPen,
  Settings2,
} from 'lucide-react';
import { addDays, dateFromKey, dateKey, todayInTimezone, WEEKDAYS_RU } from './date-utils';
import { formatMinutes, taskCalculation } from './task-utils';
import type { Note, PageView, Task, UserSettings } from './types';

interface SidebarProps {
  activePage: PageView;
  tasks: Task[];
  notes: Note[];
  userName: string;
  settings: UserSettings;
  onNavigate: (page: PageView) => void;
  onOpenNotes: (noteId?: string) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

const links = [
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'active', label: 'Активные', icon: ListTodo },
  { id: 'completed', label: 'Выполненные', icon: CheckCheck },
  { id: 'stats', label: 'Статистика', icon: ChartNoAxesColumnIncreasing },
] as const;

export function Sidebar({
  activePage, tasks, notes, userName, settings, onNavigate, onOpenNotes, onOpenSettings, onSignOut,
}: SidebarProps) {
  const activeTasks = tasks.filter((task) => task.status === 'active');
  const pinnedNotes = notes.filter((note) => note.isPinned);
  const today = todayInTimezone(settings.timezone);
  const load = Array.from({ length: 7 }, (_, index) => {
    const date = dateKey(addDays(new Date(`${today}T12:00:00`), index));
    return activeTasks
      .reduce((sum, task) => sum + (taskCalculation(task, settings).plannedMinutesByDate[date] ?? 0), 0);
  });
  const maxLoad = Math.max(...load, 1);
  const initial = userName.trim().charAt(0).toLocaleUpperCase('ru-RU') || 'U';

  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onNavigate('calendar'); }}>
          <span className="brand-mark" aria-hidden="true" />
          <span>DEADLINE</span>
        </a>

        <nav className="side-nav" aria-label="Разделы">
          {links.map(({ id, label, icon: Icon }) => (
            <button
              className={`side-link ${activePage === id ? 'is-active' : ''}`}
              key={id}
              onClick={() => onNavigate(id)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'active' && <span className="nav-count">{activeTasks.length}</span>}
            </button>
          ))}
        </nav>

        <section className="side-section workload-section">
          <div className="side-section-heading">
            <span>План на 7 дней</span>
            <span className="muted">часы</span>
          </div>
          <div className="workload-chart" role="img" aria-label="Расчётная нагрузка на ближайшие семь дней">
            {load.map((minutes, index) => {
              const day = dateKey(addDays(new Date(`${today}T12:00:00`), index));
              return (
                <div className="workload-column" key={index} title={`${formatMinutes(minutes)} · ${index === 0 ? 'сегодня' : `через ${index} дн.`}`}>
                  <span
                    className={minutes > 0 ? 'has-work' : ''}
                    style={{ height: `${Math.max(4, (minutes / maxLoad) * 100)}%` }}
                  />
                  <small>{index === 0 ? 'сег.' : WEEKDAYS_RU[dateFromKey(day).getDay()]}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="side-section notes-section">
          <div className="side-section-heading">
            <span>Заметки</span>
            <button className="text-button" type="button" onClick={() => onOpenNotes()}>Все</button>
          </div>
          <div className="pinned-notes">
            {pinnedNotes.length ? pinnedNotes.map((note) => (
              <button className="pinned-note" key={note.id} onClick={() => onOpenNotes(note.id)} type="button">
                <span className="note-pin">•</span>
                <span className="pinned-note-copy">
                  <strong>{note.title || 'Без названия'}</strong>
                  <span>{note.content || 'Пустая заметка'}</span>
                </span>
              </button>
            )) : (
              <p className="side-empty">Закрепите заметки, чтобы они всегда были под рукой.</p>
            )}
          </div>
        </section>

        <div className="sidebar-spacer" />

        <button className="side-link settings-link" onClick={onOpenSettings} type="button">
          <Settings2 size={18} strokeWidth={1.8} />
          <span>Настройки</span>
        </button>

        <div className="account-card">
          <div className="avatar" aria-hidden="true">{initial}</div>
          <div className="account-copy">
            <strong title={userName}>{userName}</strong>
            <span>Планируйте в своём ритме</span>
          </div>
          <button className="icon-button signout-button" type="button" onClick={onSignOut} aria-label="Выйти">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Разделы">
        {links.map(({ id, label, icon: Icon }) => (
          <button
            className={activePage === id ? 'is-active' : ''}
            key={id}
            onClick={() => onNavigate(id)}
            type="button"
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{id === 'active' ? 'Задачи' : id === 'completed' ? 'Готово' : label}</span>
          </button>
        ))}
        <button onClick={() => onOpenNotes()} type="button">
          <NotebookPen size={19} strokeWidth={1.8} />
          <span>Заметки</span>
        </button>
        <button onClick={onOpenSettings} type="button">
          <Settings2 size={19} strokeWidth={1.8} />
          <span>Настройки</span>
        </button>
      </nav>
    </>
  );
}
