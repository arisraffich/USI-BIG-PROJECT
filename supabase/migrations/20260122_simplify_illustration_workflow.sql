-- Migration: Simplify Illustration Workflow (Remove Trial Phase)
-- Date: 2026-01-22
-- Description: Updates project statuses to remove the trial phase.
--              The new flow is: characters_approved → [generate all] → sketches_review → illustration_approved

-- Update trial phase statuses
-- trial_review → sketches_review (customer was reviewing trial, now reviewing all sketches)
UPDATE projects SET status = 'sketches_review' WHERE status = 'trial_review';

-- trial_revision → sketches_revision (customer requested trial revision, now sketches revision)
UPDATE projects SET status = 'sketches_revision' WHERE status = 'trial_revision';

-- trial_approved → characters_approved (trial was approved, admin needs to generate and send all)
-- This puts them back in generating mode so admin can generate remaining pages and send
UPDATE projects SET status = 'characters_approved' WHERE status = 'trial_approved';

-- illustrations_generating → characters_approved (admin was generating, reset to ready state)
UPDATE projects SET status = 'characters_approved' WHERE status = 'illustrations_generating';

-- Legacy statuses
-- illustration_review → sketches_review
UPDATE projects SET status = 'sketches_review' WHERE status = 'illustration_review';

-- illustration_revision_needed → sketches_revision
UPDATE projects SET status = 'sketches_revision' WHERE status = 'illustration_revision_needed';

-- Log the migration results
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM projects WHERE status IN (
    'trial_review', 'trial_revision', 'trial_approved', 
    'illustrations_generating', 'illustration_review', 'illustration_revision_needed'
  );
  RAISE NOTICE 'Migration complete. % projects may still have old statuses (should be 0).', row_count;
END $$;
