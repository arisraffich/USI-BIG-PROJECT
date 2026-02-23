'use client'

import { useState } from 'react'
import { ProjectCard } from './ProjectCard'
import { isFollowUp, isWorking } from '@/lib/constants/statusBadgeConfig'
import { UserRound, Wrench, CheckCircle2, FileText, Users, Palette } from 'lucide-react'

type Tab = 'follow_up' | 'working' | 'finished'

interface ProjectTabsProps {
  projects: Array<any>
}

function isFinished(status: string): boolean {
  return status === 'illustration_approved' || status === 'completed'
}

type Stage = 'input' | 'characters' | 'sketches'

function getProjectStage(status: string): Stage {
  if (status === 'awaiting_customer_input' || status === 'draft') return 'input'
  if (
    status.includes('character') ||
    status === 'characters_approved' ||
    status === 'characters_regenerated'
  ) return 'characters'
  return 'sketches'
}

const STAGE_CONFIG: Record<Stage, { label: string; icon: typeof FileText }> = {
  input: { label: 'Story Stage', icon: FileText },
  characters: { label: 'Character Stage', icon: Users },
  sketches: { label: 'Sketch Stage', icon: Palette },
}

const STAGE_ORDER: Stage[] = ['input', 'characters', 'sketches']

function GroupedProjectList({ projects }: { projects: Array<any> }) {
  const grouped = STAGE_ORDER.map(stage => ({
    stage,
    config: STAGE_CONFIG[stage],
    projects: projects.filter(p => getProjectStage(p.status) === stage),
  })).filter(g => g.projects.length > 0)

  if (grouped.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-sm">No projects in this category.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {grouped.map(({ stage, config, projects }) => {
        const Icon = config.icon
        return (
          <div key={stage}>
            <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-gray-200 rounded-lg">
              <Icon className="w-4 h-4 text-gray-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">{config.label}</h3>
              <span className="text-sm font-bold text-gray-900">{projects.length}</span>
            </div>
            <div className="space-y-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} pageCount={project.pageCount} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ProjectTabs({ projects }: ProjectTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('follow_up')

  const followUpProjects = projects.filter(p => isFollowUp(p.status))
  const workingProjects = projects.filter(p => isWorking(p.status))
  const finishedProjects = projects.filter(p => isFinished(p.status))

  const tabs: { id: Tab; label: string; icon: typeof UserRound; count: number }[] = [
    { id: 'follow_up', label: 'Follow Up', icon: UserRound, count: followUpProjects.length },
    { id: 'working', label: 'Working', icon: Wrench, count: workingProjects.length },
    { id: 'finished', label: 'Finished', icon: CheckCircle2, count: finishedProjects.length },
  ]

  const activeProjects = activeTab === 'follow_up'
    ? followUpProjects
    : activeTab === 'working'
      ? workingProjects
      : finishedProjects

  return (
    <div>
      <div className="grid grid-cols-3 md:flex md:gap-1 mb-4 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center md:justify-start gap-1.5 px-2 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
        <GroupedProjectList projects={activeProjects} />
      )}
    </div>
  )
}
