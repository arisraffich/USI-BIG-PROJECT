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
      console.log(`[ProjectLayout] Fetching project with ID: ${id}`)

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
        <ProjectHeader
          projectId={id}
          projectInfo={{
            id: project.id,
            book_title: project.book_title,
            author_firstname: project.author_firstname || '',
            author_lastname: project.author_lastname || '',
            status: project.status || 'draft',
            character_send_count: project.character_send_count || 0,
            review_token: project.review_token
          }}
          pageCount={pageCount}
          characterCount={characterCount}
          hasImages={hasImages}
        />
        <main className="pt-16 min-h-screen bg-gray-50">{children}</main>
      </>
    )
  } catch (error) {
    console.error('Error in ProjectLayout:', error)
    notFound()
  }
}

