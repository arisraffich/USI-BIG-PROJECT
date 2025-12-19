-- Fix customer_image_url for projects that haven't been sent to customers yet
-- Clear customer_image_url for projects with character_send_count = 0 (first-time sends)
-- This ensures customers see forms, not empty image placeholders

UPDATE "characters"
SET customer_image_url = NULL
WHERE project_id IN (
  SELECT id FROM projects 
  WHERE character_send_count = 0 OR character_send_count IS NULL
);


