-- Migration for Illustration Generation Module

-- 1. Updates to 'projects' table for configuration
ALTER TABLE projects
ADD COLUMN illustration_aspect_ratio VARCHAR(20),
ADD COLUMN illustration_text_integration VARCHAR(20),
ADD COLUMN illustration_status VARCHAR(50) DEFAULT 'not_started',
ADD COLUMN style_reference_page_id UUID;

-- 2. Updates to 'pages' table for illustration data
ALTER TABLE pages
ADD COLUMN character_actions JSONB,
ADD COLUMN background_elements TEXT,
ADD COLUMN illustration_url TEXT,
ADD COLUMN sketch_url TEXT,
ADD COLUMN illustration_prompt TEXT,
ADD COLUMN illustration_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN illustration_version INTEGER DEFAULT 1,
ADD COLUMN illustration_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN sketch_generated_at TIMESTAMP WITH TIME ZONE;

-- 3. New 'illustration_reviews' table
CREATE TABLE illustration_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE INDEX idx_illustration_reviews_project ON illustration_reviews(project_id);
CREATE INDEX idx_illustration_reviews_page ON illustration_reviews(page_id);
CREATE INDEX idx_illustration_reviews_status ON illustration_reviews(status);
