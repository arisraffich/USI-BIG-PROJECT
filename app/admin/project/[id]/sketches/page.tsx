import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function SketchesPage({
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

  const pagesWithSketches = pages?.filter((p) => p.sketch_url) || []

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
        <h1 className="text-3xl font-bold text-gray-900">Sketches</h1>
        <p className="text-gray-600 mt-1">{project.book_title}</p>
      </div>

      {pagesWithSketches.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">
                No sketches generated yet.
              </p>
              {project.status === 'characters_approved' ? (
                <Button>Generate Sketches</Button>
              ) : (
                <p className="text-sm text-gray-600">
                  Characters must be approved before generating sketches.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pagesWithSketches.map((page) => (
            <Card key={page.id}>
              <CardContent className="pt-6">
                {page.sketch_url && (
                  <img
                    src={page.sketch_url}
                    alt={`Page ${page.page_number} sketch`}
                    className="w-full rounded-lg border mb-4"
                  />
                )}
                <h3 className="font-semibold mb-2">Page {page.page_number}</h3>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {page.story_text}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

