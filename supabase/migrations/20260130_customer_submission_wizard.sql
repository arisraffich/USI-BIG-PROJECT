-- Customer Submission Wizard (Path B) migration
-- Adds number_of_illustrations column to projects table
-- Also adds the 'awaiting_customer_input' status support

-- Add number_of_illustrations column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS number_of_illustrations INTEGER DEFAULT 12;

-- Add comment for documentation
COMMENT ON COLUMN projects.number_of_illustrations IS 'Admin-set number of illustrations for Path B (customer submission wizard)';
