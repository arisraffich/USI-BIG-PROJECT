import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProjectTabsContent } from '@/components/admin/ProjectTabsContent'
import { ProjectDevTools } from '@/components/admin/ProjectDevTools'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let pages = null
  let characters = null
  let projectStatus: string = 'draft'
  let illustrationStatus: string = 'not_started'
  let projectInfo: any = null

  try {
    const supabase = await createAdminClient()

    // Load project status, pages, and characters data in parallel
    const [projectResult, pagesResult, charactersResult] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('pages')
        .select('*')
        .eq('project_id', id)
        .order('page_number', { ascending: true }),
      supabase
        .from('characters')
        .select('*')
        .eq('project_id', id)
        .order('is_main', { ascending: false }),
    ])

    pages = pagesResult.data || null

    // Debug Server Fetch
    if (pages) {

      pages.forEach(p => {
        if (p.feedback_notes) {

        }
      })
    }

    characters = charactersResult.data || null
    projectStatus = projectResult.data?.status || 'draft'
    projectStatus = projectResult.data?.status || 'draft'
    projectInfo = projectResult.data

    // Extract illustration status
    illustrationStatus = projectResult.data?.illustration_status || 'not_started'

  } catch (error: any) {
    console.error('Error in ProjectDetailPage:', error)
    // Continue rendering with null data - component will handle empty state
  }

  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ProjectTabsContent
        projectId={id}
        pages={pages}
        characters={characters}
        projectStatus={projectStatus}
        projectInfo={projectInfo}
        illustrationStatus={illustrationStatus}
      />
      <ProjectDevTools projectId={id} />
    </Suspense>
  )
}
