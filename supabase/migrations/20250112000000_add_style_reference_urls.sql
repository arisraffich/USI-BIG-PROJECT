-- Add style_reference_urls column to projects table
-- This stores up to 3 style reference image URLs for matching illustration styles
-- Used for sequel books or specific style requirements

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS style_reference_urls TEXT[] DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN projects.style_reference_urls IS 'Array of up to 3 style reference image URLs for illustration style matching. Used for sequels or specific style requirements.';
