export type FollowUpStage = 'story' | 'character' | 'sketch'

export interface FollowUpProjectState {
  status: string
  review_token?: string | null
  created_at?: string | null
  status_changed_at?: string | null
  character_send_count?: number | null
  illustration_send_count?: number | null
}

export const MAX_FOLLOW_UP_SEQUENCE = 3

export function getFollowUpStage(project: FollowUpProjectState): FollowUpStage | null {
  if (project.status === 'awaiting_customer_input') return 'story'

  if (project.status === 'character_review' && (project.character_send_count || 0) > 0) {
    return 'character'
  }

  if (
    project.status === 'sketches_review' ||
    project.status === 'trial_review' ||
    project.status === 'illustration_review'
  ) {
    return 'sketch'
  }

  return null
}

export function getFollowUpEpisodeKey(project: FollowUpProjectState, stage: FollowUpStage): string {
  if (stage === 'story') {
    return project.status_changed_at || project.created_at || 'story-initial'
  }

  if (stage === 'character') {
    return `character-send-${project.character_send_count || 0}`
  }

  return `sketch-send-${project.illustration_send_count || 0}`
}

export function getFollowUpTemplateSlug(stage: FollowUpStage, sequence: number): string {
  return `${stage}_followup_v${sequence}`
}

export function getFollowUpButtonText(stage: FollowUpStage): string {
  if (stage === 'story') return 'Complete Project Details'
  if (stage === 'character') return 'Review Characters'
  return 'Review Sketches'
}

export function getFollowUpStageLabel(stage: FollowUpStage): string {
  if (stage === 'story') return 'Story Follow-Up'
  if (stage === 'character') return 'Character Follow-Up'
  return 'Sketch Follow-Up'
}

export function getFollowUpReviewUrl(project: FollowUpProjectState, stage: FollowUpStage): string | null {
  if (!project.review_token) return null

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  if (stage === 'story') {
    return `${baseUrl}/submit/${project.review_token}`
  }

  if (stage === 'character') {
    return `${baseUrl}/review/${project.review_token}?tab=characters`
  }

  return `${baseUrl}/review/${project.review_token}?tab=illustrations`
}

export function replaceTemplateVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match)
}

export function htmlToEditableText(html: string | null | undefined): string {
  if (!html) return ''

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(h2|p|li|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function editableTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
