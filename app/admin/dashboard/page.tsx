import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { deleteAllProjects } from '@/app/actions/delete-projects'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  try {
    const supabase = await createAdminClient()

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
      // Return empty state on error
      return (
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
            <Link href="/admin/project/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </Link>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">Unable to load projects. Please try again later.</p>
          </div>
        </div>
      )
    }

    let projectsWithCounts: Array<any> = []

    try {
      // Fetch all page counts in a single query to avoid N+1 problem
      const projectIds = (projects || []).map(p => p.id)
      let pageCountsMap: Record<string, number> = {}

      if (projectIds.length > 0) {
        const { data: pages, error: pagesError } = await supabase
          .from('pages')
          .select('project_id')
          .in('project_id', projectIds)

        if (!pagesError && pages) {
          // Count pages per project
          pageCountsMap = pages.reduce((acc, page) => {
            acc[page.project_id] = (acc[page.project_id] || 0) + 1
            return acc
          }, {} as Record<string, number>)
        }
      }

      // Map projects with their page counts
      projectsWithCounts = (projects || []).map((project) => ({
        ...project,
        pageCount: pageCountsMap[project.id] || 0,
      }))
    } catch (countError) {
      console.error('Error fetching page counts:', countError)
      projectsWithCounts = (projects || []).map((project) => ({
        ...project,
        pageCount: 0,
      }))
    }

    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <Link href="/admin/project/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {!projectsWithCounts || projectsWithCounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No projects yet.</p>
            <Link href="/admin/project/new">
              <Button>Create Your First Project</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {projectsWithCounts.map((project) => (
              <ProjectCard key={project.id} project={project} pageCount={project.pageCount} />
            ))}

            <div className="pt-12 border-t mt-12 bg-red-50 p-6 rounded-lg border border-red-200">
              <h3 className="text-red-700 font-bold mb-4 flex items-center gap-2">
                ⚠️ Danger Zone
              </h3>
              <p className="text-sm text-red-600 mb-4">
                These projects seem stubborn? Click below to forcefully delete EVERYTHING from the database.
              </p>
              <form action={deleteAllProjects}>
                <Button variant="destructive" type="submit" className="w-full">
                  DELETE ALL PROJECTS (Emergency Fix)
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  } catch (error) {
    console.error('Critical error in DashboardPage:', error)
    // Return error state
    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <Link href="/admin/project/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">An error occurred while loading projects. Please refresh the page.</p>
        </div>
      </div>
    )
  }
}
