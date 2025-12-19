-- Add sketch fields to characters table for character sketch illustrations
ALTER TABLE characters ADD COLUMN IF NOT EXISTS sketch_url TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS sketch_prompt TEXT;

-- Add comments for documentation
COMMENT ON COLUMN characters.sketch_url IS 'URL to the sketch version of the character illustration';
COMMENT ON COLUMN characters.sketch_prompt IS 'Prompt used to generate the sketch from colored illustration';
