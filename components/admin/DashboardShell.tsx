'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, FlaskConical, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardActions, MobileHeader } from '@/components/admin/DashboardActions'
import { AIStatusDot } from '@/components/admin/AIStatusDot'
import { ProjectTabs, type ProjectDashboardTab } from '@/components/project/ProjectTabs'

interface DashboardProject {
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

interface DashboardShellProps {
  projectsWithCounts: DashboardProject[]
}

function isTestProject(project: DashboardProject): boolean {
  return (project.author_firstname || '').toLowerCase().includes('test')
}

function isFinished(status: string): boolean {
  return status === 'illustration_approved' || status === 'completed'
}

export function DashboardShell({ projectsWithCounts }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<ProjectDashboardTab>('follow_up')

  const testProjects = projectsWithCounts.filter(p => isTestProject(p))
  const realProjects = projectsWithCounts.filter(p => !isTestProject(p))
  const sidebarTabs: { id: ProjectDashboardTab; label: string; icon: typeof CheckCircle2; count: number }[] = [
    { id: 'finished', label: 'Finished', icon: CheckCircle2, count: realProjects.filter(p => isFinished(p.status)).length },
    { id: 'test', label: 'Test', icon: FlaskConical, count: testProjects.length },
  ]

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden">
      <MobileHeader />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-44 shrink-0 border-r border-gray-200 bg-gray-50 p-3 flex-col">
        <div className="flex items-center gap-2 mb-5">
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <AIStatusDot />
        </div>
        <nav className="flex flex-col gap-3">
          <DashboardActions />
        </nav>
        <div className="mt-auto pb-6 space-y-2">
          <div className="space-y-1.5 border-t border-gray-200 pt-3">
            {sidebarTabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-left">{tab.label}</span>
                  <span className={`ml-auto rounded-full px-1.5 py-0.5 text-xs ${
                    isActive ? 'bg-white/15 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
          <Link href="/admin/settings" className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-900">
            <Settings className="w-4 h-4 shrink-0" />
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
          <ProjectTabs
            projects={projectsWithCounts}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
          />
        )}
      </main>
    </div>
  )
}
