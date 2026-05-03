-- Reconcile scheduled_sends with the schema already present in production.
-- This migration is written to be safe if the table already exists.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS scheduled_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT scheduled_sends_action_type_check
    CHECK (action_type IN ('send_characters', 'send_sketches')),
  CONSTRAINT scheduled_sends_status_check
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'))
);

ALTER TABLE scheduled_sends
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE scheduled_sends
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN created_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_sends_pkey'
      AND conrelid = 'public.scheduled_sends'::regclass
  ) THEN
    ALTER TABLE scheduled_sends
      ADD CONSTRAINT scheduled_sends_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_sends_project_id_fkey'
      AND conrelid = 'public.scheduled_sends'::regclass
  ) THEN
    ALTER TABLE scheduled_sends
      ADD CONSTRAINT scheduled_sends_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_sends_action_type_check'
      AND conrelid = 'public.scheduled_sends'::regclass
  ) THEN
    ALTER TABLE scheduled_sends
      ADD CONSTRAINT scheduled_sends_action_type_check
      CHECK (action_type IN ('send_characters', 'send_sketches'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_sends_status_check'
      AND conrelid = 'public.scheduled_sends'::regclass
  ) THEN
    ALTER TABLE scheduled_sends
      ADD CONSTRAINT scheduled_sends_status_check
      CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_pending
  ON scheduled_sends(scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_project
  ON scheduled_sends(project_id)
  WHERE status = 'pending';

COMMENT ON TABLE scheduled_sends IS 'Scheduled customer send jobs for character and sketch review stages.';
