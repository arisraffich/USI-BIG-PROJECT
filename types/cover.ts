/**
 * Cover Module types
 *
 * One cover per project (UNIQUE on project_id).
 * Admin-only: no customer exposure, no review workflow.
 *
 * Status semantics (v1):
 *   'pending'    — side not generated yet
 *   'completed'  — side successfully generated, URL present
 *   'failed'     — last attempt failed (not written in v1 sync flow; reserved)
 *   'generating' — reserved for a future async implementation
 */
export type CoverStatus = 'pending' | 'generating' | 'completed' | 'failed'

export interface Cover {
  id: string
  project_id: string

  title: string
  subtitle: string | null
  source_page_id: string | null

  front_url: string | null
  back_url: string | null
  front_status: CoverStatus
  back_status: CoverStatus

  created_at: string
  updated_at: string
}
