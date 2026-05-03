'use client'

import { useState } from 'react'
import { ProjectCard } from './ProjectCard'
import { isFollowUp, isWorking } from '@/lib/constants/statusBadgeConfig'
import { isCharacterModeStatus, isIllustrationModeStatus } from '@/lib/constants/projectStatuses'
import { UserRound, Wrench, CheckCircle2, FileText, Users, Palette, FlaskConical } from 'lucide-react'

export type ProjectDashboardTab = 'follow_up' | 'working' | 'finished' | 'test'

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

function isTestProject(project: DashboardProject): boolean {
  return (project.author_firstname || '').toLowerCase().includes('test')
}

interface ProjectTabsProps {
  projects: DashboardProject[]
  activeTab?: ProjectDashboardTab
  onActiveTabChange?: (tab: ProjectDashboardTab) => void
}

function isFinished(status: string): boolean {
  return status === 'illustration_approved' || status === 'completed'
}

type Stage = 'input' | 'characters' | 'sketches'

function getProjectStage(status: string): Stage {
  if (status === 'awaiting_customer_input' || status === 'draft') return 'input'
  if (isIllustrationModeStatus(status)) return 'sketches'
  if (isCharacterModeStatus(status) || status === 'characters_regenerated' || status.includes('character')) return 'characters'
  return 'sketches'
}

const STAGE_CONFIG: Record<Stage, { label: string; icon: typeof FileText }> = {
  input: { label: 'Story Stage', icon: FileText },
  characters: { label: 'Character Stage', icon: Users },
  sketches: { label: 'Sketch Stage', icon: Palette },
}

const STAGE_ORDER: Stage[] = ['input', 'characters', 'sketches']

function GroupedProjectList({
  projects,
  showFollowUpActions = false,
}: {
  projects: DashboardProject[]
  showFollowUpActions?: boolean
}) {
  const grouped = STAGE_ORDER.map(stage => ({
    stage,
    config: STAGE_CONFIG[stage],
    projects: projects.filter(p => getProjectStage(p.status) === stage),
  }))
  const visibleGrouped = grouped.filter(g => g.projects.length > 0)

  if (visibleGrouped.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-sm">No projects in this category.</p>
      </div>
    )
  }

  const renderStageGroup = ({ stage, config, projects }: typeof grouped[number], showEmptyState = false) => {
    const Icon = config.icon
    return (
      <div key={stage}>
        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-gray-200 rounded-lg">
          <Icon className="w-4 h-4 text-gray-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">{config.label}</h3>
          <span className="text-sm font-bold text-gray-900">{projects.length}</span>
        </div>
        {projects.length > 0 ? (
          <div className="space-y-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                pageCount={project.pageCount}
                showFollowUpAction={showFollowUpActions}
              />
            ))}
          </div>
        ) : showEmptyState ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center">
            <p className="text-sm text-gray-400">No projects</p>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8 xl:hidden">
        {visibleGrouped.map(group => renderStageGroup(group))}
      </div>

      <div className="hidden xl:grid xl:grid-cols-3 gap-4 items-start">
        {grouped.map(group => renderStageGroup(group, true))}
      </div>
    </>
  )
}

export function ProjectTabs({ projects, activeTab: controlledActiveTab, onActiveTabChange }: ProjectTabsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<ProjectDashboardTab>('follow_up')
  const activeTab = controlledActiveTab ?? internalActiveTab
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab

  const testProjects = projects.filter(p => isTestProject(p))
  const realProjects = projects.filter(p => !isTestProject(p))

  const followUpProjects = realProjects.filter(p => isFollowUp(p.status))
  const workingProjects = realProjects.filter(p => isWorking(p.status))
  const finishedProjects = realProjects.filter(p => isFinished(p.status))

  const tabs: { id: ProjectDashboardTab; label: string; icon: typeof UserRound; count: number }[] = [
    { id: 'follow_up', label: 'Follow Up', icon: UserRound, count: followUpProjects.length },
    { id: 'working', label: 'Working', icon: Wrench, count: workingProjects.length },
    { id: 'finished', label: 'Finished', icon: CheckCircle2, count: finishedProjects.length },
    { id: 'test', label: 'Test', icon: FlaskConical, count: testProjects.length },
  ]

  const activeProjects = activeTab === 'follow_up'
    ? followUpProjects
    : activeTab === 'working'
      ? workingProjects
      : activeTab === 'test'
        ? testProjects
        : finishedProjects

  return (
    <div>
      <div className="grid grid-cols-3 md:flex md:gap-1 mb-4 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const visibilityClass = tab.id === 'test'
            ? 'hidden'
            : tab.id === 'finished'
              ? 'flex md:hidden'
              : 'flex'
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${visibilityClass} items-center justify-center md:justify-start gap-1.5 px-2 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="hidden md:block w-4 h-4" />
              <span>{tab.label}</span>
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {activeTab === 'finished' ? (
        activeProjects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No projects in this category.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeProjects.map((project) => (
              <ProjectCard key={project.id} project={project} pageCount={project.pageCount} />
            ))}
          </div>
        )
      ) : (
        <GroupedProjectList projects={activeProjects} showFollowUpActions={activeTab === 'follow_up'} />
      )}
    </div>
  )
}
