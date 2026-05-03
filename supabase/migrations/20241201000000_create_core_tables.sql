-- Core schema baseline.
--
-- The live database already has these tables. This migration records the base
-- schema so a fresh database can be rebuilt from the repo.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  book_title VARCHAR(255) NOT NULL,
  author_firstname VARCHAR(100) NOT NULL,
  author_lastname VARCHAR(100) NOT NULL,
  author_email VARCHAR(255) NOT NULL,
  author_phone VARCHAR(20) NOT NULL,
  review_token VARCHAR(32) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'draft',
  aspect_ratio VARCHAR(20),
  text_integration VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  character_send_count INTEGER DEFAULT 0,
  illustration_aspect_ratio VARCHAR(20),
  illustration_text_integration VARCHAR(20),
  illustration_status VARCHAR(50) DEFAULT 'not_started',
  style_reference_page_id UUID,
  illustration_send_count INTEGER DEFAULT 0,
  style_reference_urls TEXT[] DEFAULT NULL,
  show_colored_to_customer BOOLEAN DEFAULT false,
  number_of_illustrations INTEGER DEFAULT 12,
  status_changed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  story_text TEXT NOT NULL,
  scene_description TEXT,
  description_auto_generated BOOLEAN DEFAULT false,
  character_ids UUID[],
  sketch_url TEXT,
  sketch_prompt TEXT,
  illustration_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_customer_edited_story_text BOOLEAN DEFAULT false,
  is_customer_edited_scene_description BOOLEAN DEFAULT false,
  original_story_text TEXT,
  original_scene_description TEXT,
  character_actions JSONB,
  background_elements TEXT,
  illustration_prompt TEXT,
  illustration_status VARCHAR(50) DEFAULT 'pending',
  illustration_version INTEGER DEFAULT 1,
  illustration_generated_at TIMESTAMPTZ,
  sketch_generated_at TIMESTAMPTZ,
  feedback_notes TEXT,
  feedback_history JSONB DEFAULT '[]'::jsonb,
  is_approved BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT true,
  customer_illustration_url TEXT,
  customer_sketch_url TEXT,
  atmosphere TEXT,
  is_spread BOOLEAN DEFAULT false,
  text_integration VARCHAR(20) DEFAULT NULL,
  illustration_type VARCHAR(20) DEFAULT NULL,
  admin_reply TEXT,
  admin_reply_at TIMESTAMPTZ,
  conversation_thread JSONB,
  admin_reply_type TEXT,
  original_illustration_url TEXT,
  sketch_approved_at TIMESTAMPTZ,
  illustration_approved_at TIMESTAMPTZ,
  UNIQUE (project_id, page_number)
);

CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255),
  role VARCHAR(255),
  appears_in TEXT[],
  story_role TEXT,
  is_main BOOLEAN DEFAULT false,
  age VARCHAR(50),
  ethnicity VARCHAR(100),
  skin_color TEXT,
  hair_color TEXT,
  hair_style TEXT,
  eye_color TEXT,
  clothing TEXT,
  accessories TEXT,
  special_features TEXT,
  gender VARCHAR(50),
  image_url TEXT,
  form_pdf_url TEXT,
  generation_prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  feedback_notes TEXT,
  feedback_history JSONB DEFAULT '[]'::jsonb,
  is_resolved BOOLEAN DEFAULT false,
  temp_image_url TEXT,
  sketch_image_url TEXT,
  customer_image_url TEXT,
  sketch_url TEXT,
  sketch_prompt TEXT,
  customer_sketch_url TEXT,
  reference_photo_url TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  review_type VARCHAR(50),
  feedback TEXT,
  status VARCHAR(50),
  submitted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_review_token
  ON projects(review_token);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
  ON projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pages_project_id
  ON pages(project_id);

CREATE INDEX IF NOT EXISTS idx_pages_project_page_number
  ON pages(project_id, page_number);

CREATE INDEX IF NOT EXISTS idx_characters_project_id
  ON characters(project_id);

CREATE INDEX IF NOT EXISTS idx_characters_is_main
  ON characters(is_main)
  WHERE is_main = true;

CREATE INDEX IF NOT EXISTS idx_reviews_project_id
  ON reviews(project_id);

CREATE INDEX IF NOT EXISTS idx_reviews_character_id
  ON reviews(character_id);

COMMENT ON TABLE projects IS 'Project metadata, author details, review token, status, and workflow settings.';
COMMENT ON TABLE pages IS 'Manuscript pages, illustration data, customer-visible image URLs, and page feedback.';
COMMENT ON TABLE characters IS 'Character definitions, generated images, customer-visible image URLs, and character feedback.';
COMMENT ON TABLE reviews IS 'Legacy review records for project and character feedback.';
