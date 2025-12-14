import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProjectHeader } from '@/components/admin/ProjectHeader'
import { getProjectCounts } from '@/lib/utils/project-counts'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    const supabase = await createAdminClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status, character_send_count, review_token')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      // Log ID for debugging


      // Only log actual errors, not "Row not found" (PGRST116)
      if (projectError && projectError.code !== 'PGRST116') {
        console.error('Error fetching project:', JSON.stringify(projectError, null, 2))
      }
      notFound()
    }

    let pageCount = 0
    let characterCount = 0
    let hasImages = false

    try {
      const counts = await getProjectCounts(supabase, id)
      pageCount = counts.pageCount
      characterCount = counts.characterCount
      hasImages = counts.hasImages
    } catch (countError) {
      console.error('Error fetching counts:', countError)
      pageCount = 0
      characterCount = 0
      hasImages = false
    }

    return (
      <>
        {children}
      </>
    )
  } catch (error) {
    console.error('Error in ProjectLayout:', error)
    notFound()
  }
}

