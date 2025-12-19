# Fix Realtime Updates for Customer Side

## Problem
Customer side doesn't receive realtime updates when admin sends characters.

## Root Cause
Supabase realtime was not properly configured for the `characters`, `pages`, and `projects` tables.

## Solution - Run This SQL

Go to your Supabase Dashboard → SQL Editor → New Query, and run:

```sql
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
```

## After Running SQL

1. **No restart needed** - Changes are immediate
2. **Test the flow:**
   - Admin: Click "Send Characters"
   - Customer tab: Should update automatically (no refresh needed)

## If Still Not Working

Check RLS policies allow customer read access:

```sql
-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('characters', 'pages', 'projects');
```

The policies should allow SELECT for customers accessing via `review_token`.

## Debug Logs

After running the SQL, check browser console for:
- `[Customer] Project status changed:`
- `[Customer] showGallery check:`

These logs will show if realtime events are being received.

