'use client';

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';

interface AuthScreenProps {
  busy: boolean;
  message: string;
  error: string;
  onSubmit: (values: { email: string; password: string; username: string }, mode: 'sign-in' | 'sign-up') => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
}

export function AuthScreen({ busy, message, error, onSubmit, onResetPassword }: AuthScreenProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'reset') {
      await onResetPassword(email);
      return;
    }
    await onSubmit({ email, password, username }, mode);
  }

  const title = mode === 'sign-in' ? 'С возвращением' : mode === 'sign-up' ? 'Создать аккаунт' : 'Восстановить пароль';
  const subtitle = mode === 'sign-in'
    ? 'Войдите, чтобы продолжить.'
    : mode === 'sign-up'
      ? 'Начните планировать в своём ритме.'
      : 'Отправим ссылку для смены пароля, если аккаунт с таким адресом существует.';

  return (
    <main className="auth-page">
      <div className="auth-showcase">
        <a className="brand auth-brand" href="#">
          <span className="brand-mark" aria-hidden="true" />
          <span>DEADLINE</span>
        </a>
        <div className="auth-story">
          <span className="eyebrow"><Sparkles size={14} /> Спокойный контроль над временем</span>
          <h1>Дела становятся<br /><em>понятнее.</em></h1>
          <p>Планируйте задачи, следите за нагрузкой и замечайте свой прогресс каждый день.</p>
          <div className="auth-quote-card">
            <div className="quote-topline"><span>Фокус на сегодня</span><span className="quote-dot" /></div>
            <strong>Маленький шаг — тоже движение.</strong>
            <div className="quote-progress"><span /></div>
            <div className="quote-bottom"><span>Ваш план, без лишнего шума</span><span>↗</span></div>
          </div>
        </div>
        <span className="auth-copyright">DEADLINE · 2026</span>
      </div>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="auth-overline"><LockKeyhole size={14} /> ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <h2>{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'sign-up' && (
              <label className="field-label">
                <span>Ваше имя</span>
                <input autoComplete="name" maxLength={30} onChange={(event) => setUsername(event.target.value)} placeholder="Например, Андрей" required value={username} />
              </label>
            )}
            <label className="field-label">
              <span>Электронная почта</span>
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} />
            </label>
            {mode !== 'reset' && <label className="field-label">
              <span>Пароль</span>
              <input autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} onChange={(event) => setPassword(event.target.value)} placeholder="Не менее 8 символов" required type="password" value={password} />
            </label>}
            {mode === 'sign-in' && <button className="text-button" onClick={() => setMode('reset')} type="button">Забыли пароль?</button>}
            {error && <p className="form-message form-error" role="alert">{error}</p>}
            {message && <p className="form-message form-success" role="status">{message}</p>}
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy ? 'Подождите…' : mode === 'sign-in' ? 'Войти' : mode === 'sign-up' ? 'Создать аккаунт' : 'Отправить ссылку'}
              {!busy && <ArrowUpRight size={17} />}
            </button>
          </form>

          <div className="auth-switch">
            <span>{mode === 'sign-up' ? 'Уже есть аккаунт?' : mode === 'reset' ? 'Вспомнили пароль?' : 'Впервые здесь?'}</span>
            <button onClick={() => setMode(mode === 'sign-up' || mode === 'reset' ? 'sign-in' : 'sign-up')} type="button">
              {mode === 'sign-up' || mode === 'reset' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </div>
          <p className="auth-privacy">Ваши задачи синхронизируются в вашем аккаунте. Пароли обрабатывает Supabase Auth.</p>
        </div>
      </section>
    </main>
  );
}

export function PasswordResetScreen({ busy, error, onSubmit }: {
  busy: boolean;
  error: string;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setLocalError('Пароли не совпадают.');
      return;
    }
    setLocalError('');
    await onSubmit(password);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="auth-overline"><LockKeyhole size={14} /> ВОССТАНОВЛЕНИЕ ДОСТУПА</span>
          <h2>Новый пароль</h2>
          <p className="auth-subtitle">Выберите пароль длиной не менее 8 символов.</p>
          <form className="auth-form" onSubmit={submit}>
            <label className="field-label"><span>Новый пароль</span><input autoComplete="new-password" minLength={8} maxLength={128} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
            <label className="field-label"><span>Повторите пароль</span><input autoComplete="new-password" minLength={8} maxLength={128} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
            {(localError || error) && <p className="form-message form-error" role="alert">{localError || error}</p>}
            <button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить пароль'}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
