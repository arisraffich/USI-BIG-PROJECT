-- Production migration history contains this covers migration version.
-- The local repo already has the covers table definition in:
-- 20260305000000_create_covers_table.sql
--
-- This file is intentionally a no-op marker so local history can match
-- production history without creating a second covers table migration.

DO $$
BEGIN
  RAISE NOTICE 'Covers table is defined by 20260305000000_create_covers_table.sql.';
END $$;
