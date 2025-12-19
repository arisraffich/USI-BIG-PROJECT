-- Enable realtime for customer-facing tables (SAFE VERSION)
-- This version checks if tables are already in publication

-- 1. Enable replica identity FULL for realtime to work properly
ALTER TABLE "characters" REPLICA IDENTITY FULL;
ALTER TABLE "pages" REPLICA IDENTITY FULL;
ALTER TABLE "projects" REPLICA IDENTITY FULL;

-- 2. Add tables to publication (only if not already there)
-- We use DO blocks to check first

DO $$
BEGIN
  -- Add pages if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "pages";
    RAISE NOTICE 'Added pages to publication';
  ELSE
    RAISE NOTICE 'pages already in publication';
  END IF;

  -- Add projects if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "projects";
    RAISE NOTICE 'Added projects to publication';
  ELSE
    RAISE NOTICE 'projects already in publication';
  END IF;

  -- characters is already there, so we skip it
  RAISE NOTICE 'characters already in publication (skipped)';
END $$;

