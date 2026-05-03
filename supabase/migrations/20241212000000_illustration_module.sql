-- Migration for Illustration Generation Module

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 1. Updates to 'projects' table for configuration
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS illustration_aspect_ratio VARCHAR(20),
ADD COLUMN IF NOT EXISTS illustration_text_integration VARCHAR(20),
ADD COLUMN IF NOT EXISTS illustration_status VARCHAR(50) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS style_reference_page_id UUID;

-- 2. Updates to 'pages' table for illustration data
ALTER TABLE pages
ADD COLUMN IF NOT EXISTS character_actions JSONB,
ADD COLUMN IF NOT EXISTS background_elements TEXT,
ADD COLUMN IF NOT EXISTS illustration_url TEXT,
ADD COLUMN IF NOT EXISTS sketch_url TEXT,
ADD COLUMN IF NOT EXISTS illustration_prompt TEXT,
ADD COLUMN IF NOT EXISTS illustration_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS illustration_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS illustration_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sketch_generated_at TIMESTAMP WITH TIME ZONE;

-- 3. New 'illustration_reviews' table
CREATE TABLE IF NOT EXISTS illustration_reviews (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  review_type VARCHAR(50), -- 'sketch' or 'final'
  feedback TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'resolved'
  admin_response TEXT,
  illustration_version INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(50) DEFAULT 'customer'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_illustration_reviews_project ON illustration_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_illustration_reviews_page ON illustration_reviews(page_id);
CREATE INDEX IF NOT EXISTS idx_illustration_reviews_status ON illustration_reviews(status);
