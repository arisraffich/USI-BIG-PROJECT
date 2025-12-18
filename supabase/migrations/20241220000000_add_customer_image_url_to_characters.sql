-- Add customer_image_url column to characters table
-- This mirrors the approach used for illustrations (customer_illustration_url)
-- Admin sees image_url (live preview), customer sees customer_image_url (only updated on Send/Resend)

ALTER TABLE "characters" 
ADD COLUMN "customer_image_url" TEXT;

-- Comment on column
COMMENT ON COLUMN "characters"."customer_image_url" IS 'The character image URL currently visible to the customer. Updated only when admin clicks Send/Resend Characters.';

-- Smart Backfill (Option C)
-- Only backfill for projects that were already sent to customers (character_send_count > 0)
-- This prevents first-time customers from seeing empty image placeholders
UPDATE "characters"
SET customer_image_url = image_url
WHERE image_url IS NOT NULL
  AND project_id IN (
    SELECT id FROM projects 
    WHERE character_send_count > 0
  );
