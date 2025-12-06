import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PagesList } from '@/components/admin/PagesList'

export default async function PagesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, book_title, status')
    .eq('id', id)
    .single()

  if (!project) {
    notFound()
  }

  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('project_id', id)
    .order('page_number', { ascending: true })

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href={`/admin/project/${id}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Project
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Story Pages</h1>
        <p className="text-gray-600 mt-1">{project.book_title}</p>
      </div>

      <PagesList projectId={id} initialPages={pages || []} projectStatus={project.status} />
    </div>
  )
}

