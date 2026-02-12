export type ProjectStatus =
  | 'draft'
  | 'awaiting_customer_input' // Customer submission wizard (Path B)
  // Character Phase
  | 'character_review'
  | 'character_generation'
  | 'character_generation_complete'
  | 'character_revision_needed'
  | 'characters_approved'
  | 'characters_regenerated'
  // Illustration Phase
  | 'sketches_review'        // All sketches sent, waiting for customer review
  | 'sketches_revision'      // Customer requested changes to sketches
  | 'illustration_approved'  // Customer approved all sketches - FINAL
  // Legacy (for migration compatibility)
  | 'trial_review'
  | 'trial_revision'
  | 'trial_approved'
  | 'illustrations_generating'
  | 'illustration_review'
  | 'illustration_revision_needed'
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
  // Customer submission wizard (Path B)
  number_of_illustrations?: number | null
  show_colored_to_customer?: boolean
}
