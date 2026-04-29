import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ProjectTabs } from '@/components/project/ProjectTabs'
import { Button } from '@/components/ui/button'
import { DashboardActions, MobileHeader } from '@/components/admin/DashboardActions'
import { AIStatusDot } from '@/components/admin/AIStatusDot'
import { Settings } from 'lucide-react'
import { getFollowUpEpisodeKey, getFollowUpStage } from '@/lib/project-followups'

interface DashboardProjectRow {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  author_email: string
  created_at: string
  status: string
  status_changed_at?: string
  character_send_count?: number
  illustration_send_count?: number
  pageCount?: number
  follow_up_stage?: string | null
  follow_up_count?: number
  follow_up_last_sent_at?: string | null
  follow_up_is_sending?: boolean
}

type DashboardLoadResult =
  | { status: 'success'; projectsWithCounts: DashboardProjectRow[] }
  | { status: 'projects-error' }
  | { status: 'critical-error' }

export const dynamic = 'force-dynamic'

async function loadDashboardProjects(): Promise<DashboardLoadResult> {
  try {
    const supabase = await createAdminClient()

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
      return { status: 'projects-error' }
    }

    let projectsWithCounts: DashboardProjectRow[] = []

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
        follow_up_stage: getFollowUpStage(project),
        follow_up_count: 0,
        follow_up_last_sent_at: null,
        follow_up_is_sending: false,
      }))

      try {
        const { data: followUps, error: followUpsError } = projectIds.length > 0
          ? await supabase
              .from('project_followups')
              .select('project_id, stage, episode_key, status, sent_at')
              .in('project_id', projectIds)
              .eq('is_test', false)
          : { data: [], error: null }

        if (!followUpsError && followUps) {
          const statsMap = followUps.reduce((acc, row: {
            project_id: string
            stage: string
            episode_key: string
            status: string
            sent_at: string | null
          }) => {
            const key = `${row.project_id}:${row.stage}:${row.episode_key}`
            const current = acc[key] || { sentCount: 0, lastSentAt: null as string | null, isSending: false }

            if (row.status === 'sent') {
              current.sentCount += 1
              if (row.sent_at && (!current.lastSentAt || row.sent_at > current.lastSentAt)) {
                current.lastSentAt = row.sent_at
              }
            }

            if (row.status === 'sending') {
              current.isSending = true
            }

            acc[key] = current
            return acc
          }, {} as Record<string, { sentCount: number; lastSentAt: string | null; isSending: boolean }>)

          projectsWithCounts = projectsWithCounts.map(project => {
            const followUpStage = getFollowUpStage(project)
            if (!followUpStage) {
              return {
                ...project,
                follow_up_stage: null,
                follow_up_count: 0,
                follow_up_last_sent_at: null,
                follow_up_is_sending: false,
              }
            }

            const episodeKey = getFollowUpEpisodeKey(project, followUpStage)
            const stats = statsMap[`${project.id}:${followUpStage}:${episodeKey}`]

            return {
              ...project,
              follow_up_stage: followUpStage,
              follow_up_count: stats?.sentCount || 0,
              follow_up_last_sent_at: stats?.lastSentAt || null,
              follow_up_is_sending: stats?.isSending || false,
            }
          })
        }
      } catch {
        // Follow-up history is optional during local setup before the migration is applied.
      }

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

    return { status: 'success', projectsWithCounts }
  } catch (error) {
    console.error('Critical error in DashboardPage:', error)
    return { status: 'critical-error' }
  }
}

function DashboardErrorLayout({ message }: { message: string }) {
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
          <p className="text-gray-500 mb-4">{message}</p>
        </div>
      </main>
    </div>
  )
}

function DashboardContent({ projectsWithCounts }: { projectsWithCounts: DashboardProjectRow[] }) {
  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden">
      <MobileHeader />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-6 flex-col">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <AIStatusDot />
        </div>
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
          <ProjectTabs projects={projectsWithCounts} />
        )}
      </main>
    </div>
  )
}

export default async function DashboardPage() {
  const result = await loadDashboardProjects()

  if (result.status === 'projects-error') {
    return <DashboardErrorLayout message="Unable to load projects. Please try again later." />
  }

  if (result.status === 'critical-error') {
    return <DashboardErrorLayout message="An error occurred while loading projects. Please refresh the page." />
  }

  return <DashboardContent projectsWithCounts={result.projectsWithCounts} />
}
