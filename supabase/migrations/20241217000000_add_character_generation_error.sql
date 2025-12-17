-- Add generation_error column to characters table
ALTER TABLE characters ADD COLUMN IF NOT EXISTS generation_error TEXT;
