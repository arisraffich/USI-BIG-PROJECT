-- Add app-used columns that exist in production but were missing from the
-- normal migration history. All additions are idempotent.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS character_send_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_colored_to_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS original_illustration_url TEXT,
  ADD COLUMN IF NOT EXISTS illustration_type VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conversation_thread JSONB,
  ADD COLUMN IF NOT EXISTS admin_reply_type TEXT;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS feedback_notes TEXT,
  ADD COLUMN IF NOT EXISTS feedback_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT false;

COMMENT ON COLUMN projects.character_send_count IS 'Number of times character review has been sent to the customer.';
COMMENT ON COLUMN projects.show_colored_to_customer IS 'Whether customer review should show colored illustrations instead of sketches.';
COMMENT ON COLUMN projects.status_changed_at IS 'Timestamp of the latest project status change.';
COMMENT ON COLUMN pages.original_illustration_url IS 'First approved/generated illustration URL kept as a reset reference.';
COMMENT ON COLUMN pages.illustration_type IS 'Per-page illustration type: spread, spot, or null for normal full-page.';
COMMENT ON COLUMN pages.conversation_thread IS 'Customer/admin follow-up conversation for a page review item.';
COMMENT ON COLUMN pages.admin_reply_type IS 'Whether the admin reply is an unresolved reply or resolved comment.';
COMMENT ON COLUMN characters.feedback_notes IS 'Current customer feedback for a character.';
COMMENT ON COLUMN characters.feedback_history IS 'Previous customer feedback entries for a character.';
COMMENT ON COLUMN characters.is_resolved IS 'Whether current character feedback has been addressed.';
