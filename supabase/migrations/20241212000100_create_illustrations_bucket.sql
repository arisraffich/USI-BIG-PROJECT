-- Create the illustrations bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('illustrations', 'illustrations', true)
on conflict (id) do nothing;

-- Set up security policies for the illustrations bucket

-- Allow public access to view images (required for displaying in UI)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'illustrations' );

-- Allow authenticated users (admin) to upload images
create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id = 'illustrations' AND auth.role() = 'authenticated' );

-- Allow authenticated users to update/delete their images (optional but good for cleanup)
create policy "Authenticated Update"
  on storage.objects for update
  using ( bucket_id = 'illustrations' AND auth.role() = 'authenticated' );

create policy "Authenticated Delete"
  on storage.objects for delete
  using ( bucket_id = 'illustrations' AND auth.role() = 'authenticated' );
