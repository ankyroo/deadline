
-- =====================================================
-- DEADLINE: COMPLETE DATABASE INITIALIZATION
-- PostgreSQL / Supabase
-- Safe for partially initialized database
-- =====================================================

-- 1. UPDATED_AT FUNCTION
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- 2. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username text NOT NULL
    CHECK (char_length(username) BETWEEN 1 AND 30),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- 3. USER SETTINGS
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE
    REFERENCES auth.users ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  week_starts_on smallint NOT NULL DEFAULT 1
    CHECK (week_starts_on IN (0, 1)),
  daily_work_limit_minutes int NOT NULL DEFAULT 240
    CHECK (daily_work_limit_minutes BETWEEN 15 AND 1440),
  reminder_time time NOT NULL DEFAULT '09:00',
  push_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- 4. TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description text,
  deadline date NOT NULL,
  estimated_minutes int NOT NULL CHECK (estimated_minutes > 0),
  priority text NOT NULL
    CHECK (priority IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  daily_limit_minutes int
    CHECK (daily_limit_minutes IS NULL OR daily_limit_minutes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  UNIQUE (id, user_id)
);


-- 5. TIME ENTRIES
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  spent_minutes int NOT NULL CHECK (spent_minutes > 0),
  work_date date NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, user_id)
    REFERENCES public.tasks (id, user_id) ON DELETE CASCADE
);


-- 6. NOTES
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- 7. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (
    type IN (
      'deadline_soon',
      'work_today',
      'at_risk',
      'deadline_missed',
      'task_completed'
    )
  ),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- 8. INDEXES
CREATE INDEX IF NOT EXISTS tasks_user_status_deadline
  ON public.tasks (user_id, status, deadline);

CREATE INDEX IF NOT EXISTS time_entries_task_date
  ON public.time_entries (task_id, work_date DESC);

CREATE INDEX IF NOT EXISTS time_entries_user_date
  ON public.time_entries (user_id, work_date);

CREATE INDEX IF NOT EXISTS notes_user_pinned
  ON public.notes (user_id, is_pinned);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);


-- 9. UPDATED_AT TRIGGERS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 't_profiles_upd'
      AND tgrelid = 'public.profiles'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER t_profiles_upd
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 't_settings_upd'
      AND tgrelid = 'public.user_settings'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER t_settings_upd
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 't_tasks_upd'
      AND tgrelid = 'public.tasks'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER t_tasks_upd
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 't_entries_upd'
      AND tgrelid = 'public.time_entries'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER t_entries_upd
    BEFORE UPDATE ON public.time_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 't_notes_upd'
      AND tgrelid = 'public.notes'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER t_notes_upd
    BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;


-- 10. MAXIMUM 5 PINNED NOTES PER USER
CREATE OR REPLACE FUNCTION public.enforce_pin_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_pinned THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));

    IF (
      SELECT count(*)
      FROM public.notes
      WHERE user_id = NEW.user_id
        AND is_pinned
        AND id <> NEW.id
    ) >= 5 THEN
      RAISE EXCEPTION 'pinned_limit_reached'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_notes_pin ON public.notes;

CREATE TRIGGER t_notes_pin
BEFORE INSERT OR UPDATE ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.enforce_pin_limit();


-- 11. AUTOMATIC PROFILE + SETTINGS CREATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    LEFT(
      COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), ''),
        SPLIT_PART(COALESCE(NEW.email, 'user'), '@', 1),
        'user'
      ),
      30
    )
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;


-- 12. ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- 13. SECURITY POLICIES
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'own_profile'
  ) THEN
    CREATE POLICY own_profile
    ON public.profiles
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_settings'
      AND policyname = 'own_settings'
  ) THEN
    CREATE POLICY own_settings
    ON public.user_settings
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tasks'
      AND policyname = 'own_tasks'
  ) THEN
    CREATE POLICY own_tasks
    ON public.tasks
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'time_entries'
      AND policyname = 'own_entries'
  ) THEN
    CREATE POLICY own_entries
    ON public.time_entries
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notes'
      AND policyname = 'own_notes'
  ) THEN
    CREATE POLICY own_notes
    ON public.notes
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'own_notifications'
  ) THEN
    CREATE POLICY own_notifications
    ON public.notifications
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END;
$$;


-- =====================================================
-- DEADLINE DATABASE INITIALIZATION COMPLETE
-- =====================================================
