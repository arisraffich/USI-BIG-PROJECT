export type ProjectStatus =
  | 'draft'
  // Character Phase
  | 'character_review'
  | 'character_generation'
  | 'character_approval'
  | 'character_approval_pending'
  | 'characters_approved'
  | 'character_form_pending'
  | 'character_generation_complete'
  | 'character_revision_needed'
  | 'characters_regenerated'
  // Illustration Phase - Trial (Page 1)
  | 'trial_review'           // Waiting for customer to review trial (page 1)
  | 'trial_revision'         // Customer requested changes to trial
  | 'trial_approved'         // Customer approved trial, admin can generate rest
  // Illustration Phase - Full Sketches
  | 'illustrations_generating' // Admin generating pages 2-N
  | 'sketches_review'        // All sketches sent, waiting for customer review
  | 'sketches_revision'      // Customer requested changes to sketches
  | 'illustration_approved'  // Customer approved all sketches - FINAL
  // Legacy (will be migrated)
  | 'illustration_review'    // → trial_review
  | 'illustration_revision_needed' // → trial_revision or sketches_revision
  // Other
  | 'completed'

export interface Project {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  author_email: string
  author_phone: string
  review_token: string
  status: ProjectStatus
  aspect_ratio?: string | null
  text_integration?: string | null
  created_at: string
  updated_at: string
  character_send_count?: number
  illustration_send_count?: number
  // Illustration Module
  illustration_aspect_ratio?: string | null
  illustration_text_integration?: string | null
  style_reference_page_id?: string | null
  // Style Reference Images (for sequel books or specific style requirements)
  style_reference_urls?: string[] | null
}
