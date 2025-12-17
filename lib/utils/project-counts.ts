import { SupabaseClient } from '@supabase/supabase-js'

export interface ProjectCounts {
  pageCount: number
  characterCount: number
  hasImages: boolean
}

/**
 * Fetch page and character counts for a project in a single optimized query
 */
export async function getProjectCounts(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectCounts> {
  const [pagesResult, charactersResult, imagesResult] = await Promise.all([
    supabase
      .from('pages')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .not('image_url', 'is', null)
      .neq('image_url', '')
      .or('is_main.eq.false,is_resolved.eq.true')
  ])

  return {
    pageCount: pagesResult.count || 0,
    characterCount: charactersResult.count || 0,
    hasImages: (imagesResult.count || 0) > 0
  }
}










