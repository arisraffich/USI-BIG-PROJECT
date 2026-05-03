-- Enables the extensions used by scheduled sends.
--
-- The actual cron job needs a deployment URL and CRON_SECRET.
-- To avoid committing secrets, this migration only schedules the job when both
-- app.base_url and app.cron_secret are provided as database settings.

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  ELSE
    RAISE NOTICE 'Skipping pg_cron extension because it is not available in this database.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  ELSE
    RAISE NOTICE 'Skipping pg_net extension because it is not available in this database.';
  END IF;
END $$;

DO $$
DECLARE
  app_base_url TEXT := NULLIF(current_setting('app.base_url', true), '');
  app_cron_secret TEXT := NULLIF(current_setting('app.cron_secret', true), '');
  existing_job_id BIGINT;
BEGIN
  IF app_base_url IS NULL OR app_cron_secret IS NULL THEN
    RAISE NOTICE 'Skipping scheduled send cron job setup because app.base_url or app.cron_secret is missing.';
    RETURN;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'Skipping scheduled send cron job setup because pg_cron is not installed.';
    RETURN;
  END IF;

  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'process-scheduled-sends'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'process-scheduled-sends',
    '* * * * *',
    FORMAT(
      $command$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $command$,
      app_base_url || '/api/scheduled-sends/execute',
      'Bearer ' || app_cron_secret
    )
  );
END $$;
