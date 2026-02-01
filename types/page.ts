export interface Page {
  id: string
  project_id: string
  page_number: number
  story_text: string
  scene_description?: string | null
  description_auto_generated: boolean
  character_ids: string[]
  sketch_url?: string | null
  sketch_prompt?: string | null
  illustration_url?: string | null
  // Published versions (Synrchronized on "Send")
  customer_illustration_url?: string | null
  customer_sketch_url?: string | null
  is_customer_edited_story_text?: boolean
  is_customer_edited_scene_description?: boolean
  original_story_text?: string | null
  original_scene_description?: string | null
  created_at: string
  updated_at: string
  // Illustration Module
  character_actions?: any | null // JSONB
  background_elements?: string | null
  atmosphere?: string | null
  illustration_prompt?: string | null
  illustration_status?: 'pending' | 'generating' | 'completed' | 'sketch_ready'
  illustration_version?: number
  illustration_generated_at?: string | null
  sketch_generated_at?: string | null
  // Feedback Module
  feedback_notes?: string | null
  feedback_history?: Array<{ note: string; created_at: string; revision_round?: number }> | null
  is_approved?: boolean
  is_resolved?: boolean
  // Admin Reply (Illustrator Note)
  admin_reply?: string | null
  admin_reply_at?: string | null
  // Spread and Text Integration (per-page settings)
  is_spread?: boolean // Deprecated: use illustration_type instead
  text_integration?: 'integrated' | 'separated' | null
  illustration_type?: 'spread' | 'spot' | null // null = normal full-page illustration
}







