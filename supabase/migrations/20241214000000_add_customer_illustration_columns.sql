-- Add columns to store the "published" version of illustrations for customers
ALTER TABLE "pages" 
ADD COLUMN "customer_illustration_url" TEXT,
ADD COLUMN "customer_sketch_url" TEXT;

-- Comment on columns
COMMENT ON COLUMN "pages"."customer_illustration_url" IS 'The illustration URL currently visible to the customer. Updated only on Send/Resend.';
COMMENT ON COLUMN "pages"."customer_sketch_url" IS 'The sketch URL currently visible to the customer. Updated only on Send/Resend.';

-- Backfill existing data so current projects don't break
-- We assume anything currently existing was "sent" or is the current best state to show
UPDATE "pages"
SET 
    customer_illustration_url = illustration_url,
    customer_sketch_url = sketch_url
WHERE illustration_url IS NOT NULL OR sketch_url IS NOT NULL;
