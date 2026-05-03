-- Move the manual reference_photo_url SQL into the normal migration folder.

ALTER TABLE characters
ADD COLUMN IF NOT EXISTS reference_photo_url TEXT;

COMMENT ON COLUMN characters.reference_photo_url IS 'Customer-uploaded visual reference photo for character generation.';
