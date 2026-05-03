# Schema Reconciliation Plan

## Plain Summary

The app works today.

The problem is not the live app. The problem is that the repo does not fully explain how to rebuild the same database from zero.

In simple terms: the real database has some tables and columns that are missing from the normal migration folder. Some old migration files are also not safe to rerun.

So the current database is okay, but the database history in the repo is messy.

Do not run all local migrations against production blindly. Some older migration files can fail if the table, column, policy, or constraint already exists.

## Current State

Current live app/database state: 80/100

Reason: the app workflows are working, but the repo cannot cleanly recreate the live database yet.

Expected state after this plan is fully implemented and tested: 90-95/100

Reason: the repo should be able to recreate the database more reliably, future fixes become safer, and we reduce hidden database surprises.

Live database has these important tables:

- `projects`
- `pages`
- `characters`
- `reviews`
- `illustration_reviews`
- `scheduled_sends`
- `email_templates`
- `covers`
- `project_followups`

Live Supabase migration history currently records only a few migrations:

- `20260304160229` - `create_scheduled_sends_table`
- `20260304160244` - `enable_pg_cron_and_pg_net`
- `20260313134320` - `add_personal_note_to_scheduled_sends`
- `20260424061625` - `create_covers_table`

Local repo migrations contain many useful schema changes, but they are not a complete, clean history of the live database.

## Important Gaps

These exist in the live database or app code, but are not represented cleanly in `supabase/migrations/`:

- Base table creation for `projects`, `pages`, `characters`, and `reviews`
- `scheduled_sends` table migration matching live history
- `email_templates` table, currently in `sql/create_email_templates.sql`
- `characters.reference_photo_url`, currently in `sql/add_reference_photo_url.sql`
- `projects.character_send_count`
- `projects.show_colored_to_customer`
- `projects.status_changed_at`
- `pages.original_illustration_url`
- `pages.illustration_type`
- `pages.conversation_thread`
- `pages.admin_reply_type`
- `characters.feedback_notes`
- `characters.feedback_history`
- `characters.is_resolved`

## Unsafe Existing Migration Patterns

Some existing migration files can fail if rerun:

- `ALTER TABLE ... ADD COLUMN` without `IF NOT EXISTS`
- `CREATE TABLE` without `IF NOT EXISTS`
- `CREATE INDEX` without `IF NOT EXISTS`
- `CREATE POLICY` without checking whether the policy already exists
- `ALTER PUBLICATION ... ADD TABLE` without checking whether the table is already in the publication
- `ALTER TABLE ... ADD CONSTRAINT` without checking whether the constraint already exists

These are safe on a brand-new database only if the previous state is exactly right. They are not safe against a database that already has some of the schema.

## Recommended Fix Order

### Step 1: Repo-only documentation

Risk: 1/100

Write down the exact mismatch and the safe repair order.

This step changes only repo documentation. It does not affect the app, production data, customer links, admin screens, Slack notifications, or images.

### Step 2: Add missing repo migration files

Risk: 5/100 if repo-only

Add missing local migration files for schema that already exists in production.

This does not mean we run them on production yet. It only means the repo gets the missing records.

Examples:

- `scheduled_sends`
- `pg_cron` / `pg_net` enablement
- `scheduled_sends.personal_note`
- `email_templates`
- `characters.reference_photo_url`
- remaining app-used columns that are present in production but missing from migrations

Every new migration must be idempotent.

Plain meaning: if the table or column already exists, the migration safely does nothing instead of failing.

Status: repo-only files have been added. They have not been run on production.

Core base table creation for `projects`, `pages`, `characters`, and `reviews` has also been added as a repo-only baseline migration.

### Step 3: Make older local migrations safer

Risk: 15/100 repo-only

Update older local migrations so they do not fail if rerun:

- add `IF NOT EXISTS` where possible
- wrap policy creation in `DO $$ ... IF NOT EXISTS ... END $$`
- wrap constraint creation in `DO $$ ... IF NOT EXISTS ... END $$`
- avoid duplicate realtime publication additions

This is still a repo safety improvement. It should not be applied to production until reviewed.

Status: older migration files have been hardened in the repo. They have not been run on production.

### Step 4: Fresh database dry run

Risk: 5/100 if done on a temporary database

Create a disposable Supabase/Postgres database and run the cleaned migration set there.

Then compare the temporary schema against production for the tables the app uses.

The goal is to prove: a fresh database can be created from repo migrations only.

Status: the migration set has been run twice successfully on a disposable local Postgres database in Docker.

The dry-run schema comparison found one app-used column that existed in repo migrations but was missing from production:

- `characters.generation_error`

Production fix status: `characters.generation_error` has been added to production as a nullable `text` column.

Plain meaning: character generation failures now have a safe place to store the error message. This does not change existing projects, customer links, images, Slack, or normal admin/customer workflows.

### Step 5: Production reconciliation decision

Risk: 35-55/100

Only after the dry run passes, decide how to handle production migration history.

Safe options:

- Keep production schema unchanged and only apply future migrations from this point forward.
- Use Supabase migration repair to mark already-existing schema migrations as applied.
- Apply only new idempotent migrations that add missing objects.

Before this step, take a backup or snapshot.

### Step 6: Future database changes

Risk: depends on the change

After the repo and production history are aligned, future database changes should be normal small migrations.

This makes later riskier fixes safer because we will know exactly what schema the app expects.

## Do Not Do Yet

- Do not run all local migrations against production.
- Do not rename or delete old migrations until we choose a migration history strategy.
- Do not change live database schema manually unless the SQL is reviewed and idempotent.
- Do not use one-off API routes or helper scripts as the normal migration process.

## Recommended Next Action

Stop database repair here unless there is a separate reason to reconcile production migration history.

The important low-risk production schema gap has been fixed.

Risk for deeper production migration-history reconciliation: 35-55/100.

Plain meaning: the app is now safer, and the remaining database-history work is advanced bookkeeping with no immediate customer/admin benefit.
