-- Cover Module: single-cover-per-project table
-- Spec: usi-platform/docs/COVER_MODULE_PLAN.md

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 1. Create covers table
CREATE TABLE IF NOT EXISTS covers (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id      UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,
  subtitle        TEXT,
  source_page_id  UUID REFERENCES pages(id) ON DELETE SET NULL,

  front_url       TEXT,
  back_url        TEXT,
  front_status    VARCHAR(20) NOT NULL DEFAULT 'pending',
  back_status     VARCHAR(20) NOT NULL DEFAULT 'pending',

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Status check constraints
-- v1 writes only 'pending' | 'completed' | 'failed'; 'generating' kept for future async compatibility.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'covers_front_status_check'
      AND conrelid = 'public.covers'::regclass
  ) THEN
    ALTER TABLE covers
      ADD CONSTRAINT covers_front_status_check
      CHECK (front_status IN ('pending', 'generating', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'covers_back_status_check'
      AND conrelid = 'public.covers'::regclass
  ) THEN
    ALTER TABLE covers
      ADD CONSTRAINT covers_back_status_check
      CHECK (back_status IN ('pending', 'generating', 'completed', 'failed'));
  END IF;
END $$;

-- 3. Index for lookups by project_id (UNIQUE already indexes, but explicit for clarity)
-- UNIQUE constraint auto-creates the index; nothing to add here.

-- 4. Comments
COMMENT ON TABLE covers IS 'One cover per project (front + back). Admin-only, not exposed to customers.';
COMMENT ON COLUMN covers.source_page_id IS 'Interior page whose illustration was used as the reference for the front cover.';
COMMENT ON COLUMN covers.front_status IS 'pending | generating | completed | failed. v1 sync flow writes pending/completed/failed only.';
COMMENT ON COLUMN covers.back_status IS 'pending | generating | completed | failed. v1 sync flow writes pending/completed/failed only.';
