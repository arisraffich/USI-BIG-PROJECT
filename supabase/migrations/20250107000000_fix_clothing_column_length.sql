-- Fix clothing column to allow longer text (was varchar(255), now TEXT)
ALTER TABLE characters ALTER COLUMN clothing TYPE TEXT;

-- Also fix any other character columns that might have the same issue
ALTER TABLE characters ALTER COLUMN accessories TYPE TEXT;
ALTER TABLE characters ALTER COLUMN special_features TYPE TEXT;
ALTER TABLE characters ALTER COLUMN skin_color TYPE TEXT;
ALTER TABLE characters ALTER COLUMN eye_color TYPE TEXT;
ALTER TABLE characters ALTER COLUMN hair_color TYPE TEXT;
ALTER TABLE characters ALTER COLUMN hair_style TYPE TEXT;
