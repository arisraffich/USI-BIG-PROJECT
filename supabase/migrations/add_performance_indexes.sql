-- Performance optimization indexes
-- Run this migration in your Supabase SQL editor

-- Index on projects.id (primary key already has index, but ensuring it exists)
-- Note: Primary keys automatically have indexes, but we'll document it here

-- Index on pages.project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);

-- Index on characters.project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);

-- Composite index on pages(project_id, page_number) for efficient ordering and filtering
CREATE INDEX IF NOT EXISTS idx_pages_project_page_number ON pages(project_id, page_number);

-- Index on projects.created_at for dashboard ordering
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Index on characters.is_main for faster main character lookups
CREATE INDEX IF NOT EXISTS idx_characters_is_main ON characters(is_main) WHERE is_main = true;











