-- Enable realtime for customer-facing tables
-- This allows customers to receive live updates without authentication

-- 1. Enable replica identity FULL for realtime to work properly
-- This ensures all column values are sent in realtime events
ALTER TABLE "characters" REPLICA IDENTITY FULL;
ALTER TABLE "pages" REPLICA IDENTITY FULL;
ALTER TABLE "projects" REPLICA IDENTITY FULL;

-- 2. Enable realtime publication for these tables
-- This makes the tables available for realtime subscriptions
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
    END IF;
  END LOOP;
END $$;

-- Note: RLS policies should already allow read access via review_token
-- If realtime still doesn't work, we may need to adjust RLS policies




