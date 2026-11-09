import { describe, expect, it } from 'vitest';
import { safeAuthError, safeDataError, UserFacingError } from './safe-errors';

describe('Supabase error messages', () => {
  it('never renders raw authentication errors', () => {
    expect(safeAuthError(new Error('internal SQL details'))).toBe(
      'Не удалось выполнить вход или регистрацию. Проверьте данные и попробуйте ещё раз.',
    );
  });

  it('maps database constraint errors to safe text', () => {
    expect(safeDataError({ code: '23514', message: 'private constraint detail' }, 'fallback'))
      .toBe('Некоторые поля не проходят проверку. Проверьте введённые данные.');
  });

  it('keeps deliberate user-facing validation messages', () => {
    expect(safeDataError(new UserFacingError('Можно закрепить не больше пяти заметок.'), 'fallback'))
      .toBe('Можно закрепить не больше пяти заметок.');
  });
});
