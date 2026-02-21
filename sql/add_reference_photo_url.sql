-- Add reference_photo_url column to characters table
-- Stores customer-uploaded photo used as visual reference for character generation

ALTER TABLE characters
ADD COLUMN IF NOT EXISTS reference_photo_url TEXT;
