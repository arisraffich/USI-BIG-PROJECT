-- Enable realtime for customer-facing tables (SAFE VERSION)
-- This version checks if tables are already in publication

-- 1. Enable replica identity FULL for realtime to work properly
ALTER TABLE "characters" REPLICA IDENTITY FULL;
ALTER TABLE "pages" REPLICA IDENTITY FULL;
ALTER TABLE "projects" REPLICA IDENTITY FULL;

-- 2. Add tables to publication (only if not already there)
-- We use DO blocks to check first

DO $$
DECLARE
  target_table TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE NOTICE 'Skipping realtime publication setup because supabase_realtime does not exist.';
    RETURN;
  END IF;

  FOREACH target_table IN ARRAY ARRAY['characters', 'pages', 'projects']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
      RAISE NOTICE 'Added % to publication', target_table;
    ELSE
      RAISE NOTICE '% already in publication', target_table;
    END IF;
  END LOOP;
END $$;




