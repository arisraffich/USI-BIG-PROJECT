-- Migration: Add Spread and Per-Page Text Integration
-- Date: 2026-01-30
-- Description: Adds is_spread flag for double-page spreads and text_integration 
--              column for per-page text placement settings.

-- Add is_spread column for double-page spread support
ALTER TABLE pages
ADD COLUMN IF NOT EXISTS is_spread BOOLEAN DEFAULT false;

-- Add text_integration column for per-page text placement
-- Values: 'integrated' | 'separated' | NULL (null = use project default)
ALTER TABLE pages
ADD COLUMN IF NOT EXISTS text_integration VARCHAR(20) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN pages.is_spread IS 'True if this page is a double-page spread (uses wider aspect ratio)';
COMMENT ON COLUMN pages.text_integration IS 'Per-page text integration setting: integrated, separated, or null for project default';
