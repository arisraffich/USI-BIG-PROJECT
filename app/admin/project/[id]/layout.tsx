import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createAdminClient()

  try {
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
  } catch (error) {
    console.error('Error in ProjectLayout:', error)
    notFound()
  }

  return (
    <>
      {children}
    </>
  )
}
