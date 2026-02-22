'use client'

import { useState } from 'react'
import { ProjectCard } from './ProjectCard'
import { isFollowUp, isWorking } from '@/lib/constants/statusBadgeConfig'
import { UserRound, Wrench, CheckCircle2 } from 'lucide-react'

type Tab = 'follow_up' | 'working' | 'finished'

interface ProjectTabsProps {
  projects: Array<any>
}

function isFinished(status: string): boolean {
  return status === 'illustration_approved' || status === 'completed'
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
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline">{tab.label}</span>
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {activeProjects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No projects in this category.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeProjects.map((project) => (
            <ProjectCard key={project.id} project={project} pageCount={project.pageCount} />
          ))}
        </div>
      )}
    </div>
  )
}
