-- Add customer_sketch_url column to characters table
ALTER TABLE characters ADD COLUMN IF NOT EXISTS customer_sketch_url TEXT;

-- Add comment
COMMENT ON COLUMN characters.customer_sketch_url IS 'URL for the sketch version of the character visible to customers';

