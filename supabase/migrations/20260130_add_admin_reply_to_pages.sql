-- Add admin_reply fields to pages table for illustrator responses to customer feedback
-- This allows admins to reply to customer reviews without regenerating the image

ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS admin_reply TEXT,
ADD COLUMN IF NOT EXISTS admin_reply_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN pages.admin_reply IS 'Admin/illustrator reply to customer feedback - shown as "Illustrator Note"';
COMMENT ON COLUMN pages.admin_reply_at IS 'Timestamp when admin reply was added';
