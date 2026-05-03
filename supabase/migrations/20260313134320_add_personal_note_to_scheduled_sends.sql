-- Add the optional message admins can include with a scheduled send.

ALTER TABLE scheduled_sends
ADD COLUMN IF NOT EXISTS personal_note TEXT;
