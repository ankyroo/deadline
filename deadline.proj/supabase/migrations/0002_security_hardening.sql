-- Reapply the tenant policies so deployments cannot retain stale policies
-- with the same names from an earlier database state.
BEGIN;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Remove every policy on only these app tables before restoring the intended
-- tenant boundary. PostgreSQL policy expressions are not user-controlled.
DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'profiles', 'user_settings', 'tasks', 'time_entries', 'notes', 'notifications'
      ])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', existing_policy.policyname, existing_policy.tablename);
  END LOOP;
END;
$$;

CREATE POLICY own_profile
ON public.profiles FOR ALL TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY own_settings
ON public.user_settings FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY own_tasks
ON public.tasks FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY own_entries
ON public.time_entries FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY own_notes
ON public.notes FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY own_notifications
ON public.notifications FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- NOT VALID avoids scanning existing user data during ADD CONSTRAINT, while
-- PostgreSQL still enforces each check for every new or changed row.
-- Run VALIDATE CONSTRAINT after reviewing any legacy values that exceed them.
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_description_max_chars
  CHECK (description IS NULL OR char_length(description) <= 4000) NOT VALID;

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_comment_max_chars
  CHECK (comment IS NULL OR char_length(comment) <= 160) NOT VALID;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_title_max_chars
  CHECK (char_length(title) <= 120) NOT VALID,
  ADD CONSTRAINT notes_content_max_chars
  CHECK (char_length(content) <= 20000) NOT VALID;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_title_max_chars
  CHECK (char_length(title) <= 120) NOT VALID,
  ADD CONSTRAINT notifications_message_max_chars
  CHECK (char_length(message) <= 4000) NOT VALID;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_timezone_max_chars
  CHECK (char_length(timezone) <= 80) NOT VALID;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_daily_limit_max_minutes
  CHECK (daily_limit_minutes IS NULL OR daily_limit_minutes BETWEEN 15 AND 1440) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_max_chars
  CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048) NOT VALID;

COMMIT;
