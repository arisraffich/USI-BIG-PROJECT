-- Idempotent storage bucket setup for USI Platform.
-- This does not delete or rename existing buckets. It only creates missing
-- public buckets used by the app and adds a shared public-read policy.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('project-files', 'project-files', true),
  ('character-images', 'character-images', true),
  ('character-sketches', 'character-sketches', true),
  ('illustrations', 'illustrations', true),
  ('sketches', 'sketches', true),
  ('lineart', 'lineart', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read access for USI storage buckets'
  ) THEN
    CREATE POLICY "Public read access for USI storage buckets"
      ON storage.objects
      FOR SELECT
      TO public
      USING (
        bucket_id IN (
          'project-files',
          'character-images',
          'character-sketches',
          'illustrations',
          'sketches',
          'lineart'
        )
      );
  END IF;
END $$;

