-- Add columns to store original text before customer edits
-- Run this migration in your Supabase SQL editor

ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS original_story_text TEXT,
ADD COLUMN IF NOT EXISTS original_scene_description TEXT;

-- Add comment for documentation
COMMENT ON COLUMN pages.original_story_text IS 'Original story text before customer edits (set when project is sent to customer)';
COMMENT ON COLUMN pages.original_scene_description IS 'Original scene description before customer edits (set when project is sent to customer)';











