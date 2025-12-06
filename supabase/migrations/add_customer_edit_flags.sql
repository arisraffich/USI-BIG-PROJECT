-- Add customer edit tracking flags to pages table
-- Run this migration in your Supabase SQL editor

-- Add columns to track customer edits for highlighting
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS is_customer_edited_story_text BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_customer_edited_scene_description BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN pages.is_customer_edited_story_text IS 'Flag to indicate if story_text was edited by customer during review';
COMMENT ON COLUMN pages.is_customer_edited_scene_description IS 'Flag to indicate if scene_description was edited by customer during review';






