-- Create the illustrations bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('illustrations', 'illustrations', true)
on conflict (id) do nothing;

-- Set up security policies for the illustrations bucket

-- Allow public access to view images (required for displaying in UI)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public Access'
  ) THEN
    CREATE POLICY "Public Access"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'illustrations');
  END IF;
END $$;

-- Allow authenticated users (admin) to upload images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated Upload'
  ) THEN
    CREATE POLICY "Authenticated Upload"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'illustrations' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow authenticated users to update/delete their images (optional but good for cleanup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated Update'
  ) THEN
    CREATE POLICY "Authenticated Update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'illustrations' AND auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated Delete'
  ) THEN
    CREATE POLICY "Authenticated Delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'illustrations' AND auth.role() = 'authenticated');
  END IF;
END $$;
