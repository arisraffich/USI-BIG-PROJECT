import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'
import { DashboardActions, MobileHeader } from '@/components/admin/DashboardActions'
import { Settings } from 'lucide-react'


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
      return (
        <div className="flex h-screen overflow-hidden">
          <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-6 flex flex-col">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Projects</h1>
            <nav className="flex flex-col gap-3"><DashboardActions /></nav>
            <div className="mt-auto pt-6">
              <Link href="/admin/settings" className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm">
                <Settings className="w-4 h-4" />Settings
              </Link>
            </div>
          </aside>
          <main className="flex-1 overflow-y-auto p-8">
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">Unable to load projects. Please try again later.</p>
            </div>
          </main>
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

      // Sort: Active projects first (by most recent status change), approved at bottom
      projectsWithCounts.sort((a, b) => {
        const aApproved = a.status === 'illustration_approved'
        const bApproved = b.status === 'illustration_approved'
        
        if (aApproved !== bApproved) {
          return aApproved ? 1 : -1
        }
        
        const aTime = new Date(a.status_changed_at || a.created_at).getTime()
        const bTime = new Date(b.status_changed_at || b.created_at).getTime()
        return bTime - aTime
      })
    } catch (countError) {
      console.error('Error fetching page counts:', countError)
      projectsWithCounts = (projects || []).map((project) => ({
        ...project,
        pageCount: 0,
      }))
    }

    return (
      <div className="h-screen flex flex-col md:flex-row overflow-hidden">
        <MobileHeader />

        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-6 flex-col">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Projects</h1>
          <nav className="flex flex-col gap-3">
            <DashboardActions />
          </nav>
          <div className="mt-auto pb-6">
            <Link href="/admin/settings" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors text-base font-medium">
              <Settings className="w-5 h-5" />
              Settings
            </Link>
          </div>
        </aside>

        {/* Scrollable projects area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
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
            </div>
          )}
        </main>
      </div>
    )
  } catch (error) {
    console.error('Critical error in DashboardPage:', error)
    return (
      <div className="flex h-screen overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-6 flex flex-col">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Projects</h1>
          <nav className="flex flex-col gap-3"><DashboardActions /></nav>
          <div className="mt-auto pt-6">
            <Link href="/admin/settings" className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm">
              <Settings className="w-4 h-4" />Settings
            </Link>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto p-8">
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">An error occurred while loading projects. Please refresh the page.</p>
          </div>
        </main>
      </div>
    )
  }
}
