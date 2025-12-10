import { createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { CustomerProjectTabsContent } from '@/components/review/CustomerProjectTabsContent'
import { Suspense } from 'react'

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!token) {
    notFound()
  }

  const supabase = await createAdminClient()

  console.log(`[ReviewPage] Accessing with token: ${token}`)

  // Fetch project by review token
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, book_title, author_firstname, author_lastname, status, review_token')
    .eq('review_token', token)
    .single()

  if (projectError || !project) {
    console.error('[ReviewPage] Project not found or error:', projectError)
    console.error(`[ReviewPage] Token used: ${token}`)
    notFound()
  }

  // Fetch pages and characters in parallel
  const [pagesResult, charactersResult] = await Promise.all([
    supabase
      .from('pages')
      .select('*')
      .eq('project_id', project.id)
      .order('page_number', { ascending: true }),
    supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)
      .order('is_main', { ascending: false }),
  ])

  const pages = pagesResult.data || null
  const characters = charactersResult.data || null

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="p-8">Loading...</div>}>
        <CustomerProjectTabsContent
          projectId={project.id}
          pages={pages}
          characters={characters}
          projectStatus={project.status}
          reviewToken={token}
          projectTitle={project.book_title}
          authorName={`${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Author'}
        />
      </Suspense>
    </div>
  )
}






