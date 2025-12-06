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
  is_customer_edited_story_text?: boolean
  is_customer_edited_scene_description?: boolean
  original_story_text?: string | null
  original_scene_description?: string | null
  created_at: string
  updated_at: string
}







