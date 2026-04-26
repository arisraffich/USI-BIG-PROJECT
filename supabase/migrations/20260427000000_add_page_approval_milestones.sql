ALTER TABLE pages
ADD COLUMN IF NOT EXISTS sketch_approved_at timestamptz,
ADD COLUMN IF NOT EXISTS illustration_approved_at timestamptz;

COMMENT ON COLUMN pages.sketch_approved_at IS 'Customer approval timestamp for the sketch/line-art version of this page';
COMMENT ON COLUMN pages.illustration_approved_at IS 'Customer approval timestamp for the colored illustration version of this page';
