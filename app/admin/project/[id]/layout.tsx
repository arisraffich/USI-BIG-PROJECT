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
      console.error('Error fetching project:', projectError)
      notFound()
    }

    let pageCount = 0
    let characterCount = 0

    try {
      const counts = await getProjectCounts(supabase, id)
      pageCount = counts.pageCount
      characterCount = counts.characterCount
    } catch (countError) {
      console.error('Error fetching counts:', countError)
      pageCount = 0
      characterCount = 0
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
        />
        <main className="pt-16 min-h-screen bg-gray-50">{children}</main>
      </>
    )
  } catch (error) {
    console.error('Error in ProjectLayout:', error)
    notFound()
  }
}

