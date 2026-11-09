# DEADLINE — Next.js + Supabase (этап 1: основа)

Готово в этом пакете:
- `supabase/migrations/0001_init.sql` — таблицы, ограничения, индексы, триггеры, RLS.
- `src/lib/calculations/deadline.ts` + тесты — расчёты в целых минутах, часовые пояса, граничные случаи.
- `src/lib/supabase/{client,server}.ts` — клиенты Supabase для App Router.

## Запуск

1. Создайте проект на supabase.com.
2. SQL Editor → вставьте и выполните `supabase/migrations/0001_init.sql`.
3. Authentication → Providers → Email включён. Для «Восстановления пароля» укажите Site URL и Redirect URLs.
4. Создайте каркас и перенесите файлы:
   ```bash
   npx create-next-app@latest deadline --ts --tailwind --app --src-dir
   cd deadline
   npm i @supabase/supabase-js @supabase/ssr framer-motion lucide-react zod react-hook-form @hookform/resolvers
   npm i -D vitest
   npx shadcn@latest init
   ```
   Скопируйте `src/lib`, `supabase`, `.env.example` в проект, затем `cp .env.example .env.local` и впишите ключи.
5. Добавьте в `package.json` скрипт `"test": "vitest run"` и запустите `npm test`.

## Что проверить после миграции

- Регистрация создаёт строки в `profiles` и `user_settings` (триггер `on_auth_user_created`).
- Шестая закреплённая заметка отклоняется базой: ошибка `pinned_limit_reached`.
- Пользователь B не видит и не меняет данные пользователя A (RLS на всех таблицах).
- Запись времени нельзя привязать к чужой задаче (составной внешний ключ).

## Дальше (этапы 2–9)

Дизайн-система, календарь и боковая панель, авторизация и middleware обновления сессии, CRUD задач и времени, заметки, фокус-таймер, уведомления (Web Push + планировщик: Supabase Cron / Edge Function), статистика, настройки.

Секретные ключи нужны только для серверной рассылки уведомлений и не должны попадать в клиентский код.
