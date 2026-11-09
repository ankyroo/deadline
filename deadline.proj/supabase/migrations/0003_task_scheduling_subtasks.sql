-- Per-task recurring availability and optional parent/child task groups.
-- The legacy daily limit columns remain in place for existing rows and clients.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_parent_same_user_fkey'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_parent_same_user_fkey
      FOREIGN KEY (parent_task_id, user_id)
      REFERENCES public.tasks (id, user_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_parent_not_self_check'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_parent_not_self_check
      CHECK (parent_task_id IS NULL OR parent_task_id <> id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_weekly_schedule_object_check'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_weekly_schedule_object_check
      CHECK (jsonb_typeof(weekly_schedule) = 'object');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tasks_parent_task_id
  ON public.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;
