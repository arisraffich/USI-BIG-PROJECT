CREATE TABLE IF NOT EXISTS project_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('story', 'character', 'sketch')),
  episode_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1 AND sequence <= 3),
  template_slug TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  is_test BOOLEAN NOT NULL DEFAULT false,
  provider_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_followups_project_idx
  ON project_followups(project_id);

CREATE INDEX IF NOT EXISTS project_followups_lookup_idx
  ON project_followups(project_id, stage, episode_key, status, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS project_followups_live_sequence_idx
  ON project_followups(project_id, stage, episode_key, sequence)
  WHERE is_test = false AND status IN ('sending', 'sent');

CREATE OR REPLACE FUNCTION update_project_followups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_project_followups_updated_at ON project_followups;
CREATE TRIGGER set_project_followups_updated_at
  BEFORE UPDATE ON project_followups
  FOR EACH ROW
  EXECUTE FUNCTION update_project_followups_updated_at();

ALTER TABLE project_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to project_followups"
  ON project_followups
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE project_followups IS 'History of admin-sent customer follow-up emails per waiting round.';
