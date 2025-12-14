-- Add illustration_send_count to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS illustration_send_count INTEGER DEFAULT 0;

-- Add feedback columns to pages table
-- These will store feedback for the illustration/sketch of that page
ALTER TABLE pages
ADD COLUMN IF NOT EXISTS feedback_notes TEXT,
ADD COLUMN IF NOT EXISTS feedback_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT TRUE;

-- Add comments for clarity
COMMENT ON COLUMN projects.illustration_send_count IS 'Number of times the illustration trial has been sent to the customer';
COMMENT ON COLUMN pages.feedback_notes IS 'Current feedback notes from the customer regarding the illustration/sketch';
COMMENT ON COLUMN pages.feedback_history IS 'History of previous feedback notes for this page';
COMMENT ON COLUMN pages.is_approved IS 'Whether the customer has approved the illustration for this page';
COMMENT ON COLUMN pages.is_resolved IS 'Whether the current feedback has been addressed (True if no feedback or new generation made)';
