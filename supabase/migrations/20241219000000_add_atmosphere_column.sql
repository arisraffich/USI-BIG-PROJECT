-- Add atmosphere column to pages table for structured scene descriptions
-- This completes the 3-part structure: character_actions, background_elements, atmosphere

ALTER TABLE pages ADD COLUMN IF NOT EXISTS atmosphere TEXT;

-- Add comment for clarity
COMMENT ON COLUMN pages.atmosphere IS 'Mood, lighting, and emotional tone of the scene (part of structured scene description)';


