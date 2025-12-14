export type ProjectStatus =
  | 'draft'
  | 'character_review'
  | 'character_generation'
  | 'character_approval'
  | 'character_approval_pending'
  | 'characters_approved'
  // Illustration Phase
  | 'illustration_review'
  | 'illustration_revision_needed'
  | 'illustration_approved' // or trial_approved
  // Later Phases
  | 'sketch_generation'
  | 'sketch_ready'
  | 'completed'
  | 'character_form_pending'
  | 'character_generation_complete'
  | 'characters_approved'
  | 'character_revision_needed'
  | 'characters_regenerated'

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
  illustration_status?: 'not_started' | 'analyzing' | 'generating' | 'completed' | 'sketch_review'
  style_reference_page_id?: string | null
}
