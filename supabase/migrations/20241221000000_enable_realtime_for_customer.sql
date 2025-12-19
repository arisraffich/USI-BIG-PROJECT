-- Enable realtime for customer-facing tables
-- This allows customers to receive live updates without authentication

-- 1. Enable replica identity FULL for realtime to work properly
-- This ensures all column values are sent in realtime events
ALTER TABLE "characters" REPLICA IDENTITY FULL;
ALTER TABLE "pages" REPLICA IDENTITY FULL;
ALTER TABLE "projects" REPLICA IDENTITY FULL;

-- 2. Enable realtime publication for these tables
-- This makes the tables available for realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE "characters";
ALTER PUBLICATION supabase_realtime ADD TABLE "pages";
ALTER PUBLICATION supabase_realtime ADD TABLE "projects";

-- Note: RLS policies should already allow read access via review_token
-- If realtime still doesn't work, we may need to adjust RLS policies


