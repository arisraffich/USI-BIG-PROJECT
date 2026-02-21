export interface Character {
  id: string
  project_id: string
  name?: string | null
  role?: string | null
  appears_in: string[]
  story_role?: string | null
  is_main: boolean
  age?: string | null
  ethnicity?: string | null
  skin_color?: string | null
  hair_color?: string | null
  hair_style?: string | null
  eye_color?: string | null
  clothing?: string | null
  accessories?: string | null
  special_features?: string | null
  gender?: string | null
  image_url?: string | null
  sketch_url?: string | null
  sketch_prompt?: string | null
  customer_image_url?: string | null
  customer_sketch_url?: string | null
  feedback_notes?: string | null
  feedback_history?: Array<{ note: string; created_at: string; revision_round?: number }> | null
  is_resolved?: boolean
  form_pdf_url?: string | null
  reference_photo_url?: string | null
  generation_prompt?: string | null
  generation_error?: string | null
  created_at: string
  updated_at: string
}


















