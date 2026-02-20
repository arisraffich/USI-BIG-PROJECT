-- Email Templates table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  closing_html TEXT,
  has_button BOOLEAN DEFAULT false,
  button_text TEXT,
  button_color TEXT DEFAULT '#2563eb',
  button_url_variable TEXT,
  available_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_email_templates_updated_at ON email_templates;
CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_email_templates_updated_at();

-- RLS: allow service role full access (admin-only table)
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to email_templates"
  ON email_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);
