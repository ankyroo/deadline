type ErrorDetails = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
};

function details(error: unknown): ErrorDetails {
  return typeof error === 'object' && error !== null ? error as ErrorDetails : {};
}

export class UserFacingError extends Error {}

export function safeAuthError(error: unknown): string {
  const item = details(error);
  if (item.code === 'weak_password') return 'Пароль должен содержать не менее 8 символов.';
  if (item.code === 'email_not_confirmed') return 'Подтвердите адрес по ссылке из письма.';
  if (item.code === 'too_many_requests' || item.status === 429) {
    return 'Слишком много попыток. Подождите немного и повторите.';
  }
  return 'Не удалось выполнить вход или регистрацию. Проверьте данные и попробуйте ещё раз.';
}

export function safeDataError(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;

  const item = details(error);
  if (item.code === 'pinned_limit_reached' || item.message === 'pinned_limit_reached') {
    return 'Можно закрепить не больше пяти заметок.';
  }
  if (item.code === '23514') return 'Некоторые поля не проходят проверку. Проверьте введённые данные.';
  if (item.code === '42501') return 'Недостаточно прав для этого действия.';
  if (item.code === 'too_many_requests' || item.status === 429) {
    return 'Слишком много запросов. Подождите немного и повторите.';
  }
  return fallback;
}
