BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(25);

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'rls-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'rls-b@example.test');

INSERT INTO public.tasks (id, user_id, title, deadline, estimated_minutes, priority)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A task', DATE '2030-01-01', 60, 'medium'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'B task', DATE '2030-01-01', 60, 'medium');

INSERT INTO public.time_entries (task_id, user_id, spent_minutes, work_date)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 30, DATE '2030-01-01'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 30, DATE '2030-01-01');

INSERT INTO public.notes (user_id, title, content)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'A note', 'private'),
  ('22222222-2222-4222-8222-222222222222', 'B note', 'private');

INSERT INTO public.notifications (user_id, title, message, type)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'A notification', 'private', 'work_today'),
  ('22222222-2222-4222-8222-222222222222', 'B notification', 'private', 'work_today');

SELECT ok(
  (SELECT count(*) = 6 AND bool_and(c.relrowsecurity)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = ANY (ARRAY['profiles', 'user_settings', 'tasks', 'time_entries', 'notes', 'notifications'])),
  'all six app tables have RLS enabled'
);

SELECT ok(
  (SELECT count(*) = 6 AND bool_and(p.with_check IS NOT NULL)
   FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.policyname = ANY (ARRAY['own_profile', 'own_settings', 'own_tasks', 'own_entries', 'own_notes', 'own_notifications'])),
  'every tenant policy includes WITH CHECK'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

SELECT is((SELECT count(*) FROM public.profiles), 1::bigint, 'A reads only A profile');
SELECT is((SELECT count(*) FROM public.user_settings), 1::bigint, 'A reads only A settings');
SELECT is((SELECT count(*) FROM public.tasks), 1::bigint, 'A reads only A tasks');
SELECT is((SELECT count(*) FROM public.time_entries), 1::bigint, 'A reads only A time entries');
SELECT is((SELECT count(*) FROM public.notes), 1::bigint, 'A reads only A notes');
SELECT is((SELECT count(*) FROM public.notifications), 1::bigint, 'A reads only A notifications');

SELECT is_empty($$UPDATE public.profiles SET username = 'changed' WHERE id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot update B profile');
SELECT is_empty($$UPDATE public.user_settings SET timezone = 'UTC' WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot update B settings');
SELECT is_empty($$UPDATE public.tasks SET title = 'changed' WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot update B tasks');
SELECT is_empty($$UPDATE public.time_entries SET comment = 'changed' WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot update B time entries');
SELECT is_empty($$UPDATE public.notes SET content = 'changed' WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot update B notes');
SELECT is_empty($$UPDATE public.notifications SET is_read = true WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot update B notifications');

SELECT is_empty($$DELETE FROM public.profiles WHERE id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot delete B profile');
SELECT is_empty($$DELETE FROM public.user_settings WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot delete B settings');
SELECT is_empty($$DELETE FROM public.tasks WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot delete B tasks');
SELECT is_empty($$DELETE FROM public.time_entries WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot delete B time entries');
SELECT is_empty($$DELETE FROM public.notes WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot delete B notes');
SELECT is_empty($$DELETE FROM public.notifications WHERE user_id = '22222222-2222-4222-8222-222222222222' RETURNING id$$, 'A cannot delete B notifications');

SELECT throws_ok(
  $$INSERT INTO public.tasks (user_id, title, deadline, estimated_minutes, priority) VALUES ('22222222-2222-4222-8222-222222222222', 'forged', DATE '2030-01-01', 60, 'medium')$$,
  '42501', NULL, 'A cannot insert a task for B'
);
SELECT throws_ok(
  $$INSERT INTO public.time_entries (task_id, user_id, spent_minutes, work_date) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 30, DATE '2030-01-01')$$,
  '42501', NULL, 'A cannot insert a time entry for B'
);
SELECT throws_ok(
  $$INSERT INTO public.notes (user_id, title, content) VALUES ('22222222-2222-4222-8222-222222222222', 'forged', 'private')$$,
  '42501', NULL, 'A cannot insert a note for B'
);
SELECT throws_ok(
  $$INSERT INTO public.notifications (user_id, title, message, type) VALUES ('22222222-2222-4222-8222-222222222222', 'forged', 'private', 'work_today')$$,
  '42501', NULL, 'A cannot insert a notification for B'
);

SELECT results_eq(
  $$INSERT INTO public.tasks (user_id, title, deadline, estimated_minutes, priority) VALUES ('11111111-1111-4111-8111-111111111111', 'A new task', DATE '2030-01-01', 60, 'medium') RETURNING title$$,
  ARRAY['A new task'], 'A can insert A own task'
);

SELECT * FROM finish();
ROLLBACK;
