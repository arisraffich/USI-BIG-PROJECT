import { SupabaseClient } from '@supabase/supabase-js'

export interface ProjectCounts {
  pageCount: number
  characterCount: number
}

/**
 * Fetch page and character counts for a project in a single optimized query
 */
export async function getProjectCounts(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectCounts> {
  const [pagesResult, charactersResult] = await Promise.all([
    supabase
      .from('pages')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ])

  return {
    pageCount: pagesResult.count || 0,
    characterCount: charactersResult.count || 0,
  }
}








