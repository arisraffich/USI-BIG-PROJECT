'use client'

import { UnifiedHeaderShell } from '@/components/layout/UnifiedHeaderShell'
import { SharedProjectHeader } from '@/components/layout/SharedProjectHeader'
import { useTransition, useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Loader2, Send, Menu, FileText, Sparkles, ArrowLeft, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProjectStatus } from '@/types/project'
import { useProjectStatus } from '@/hooks/use-project-status'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { MobilePageNavigator } from '@/components/ui/mobile-page-navigator'

interface ProjectInfo {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  status: ProjectStatus
  character_send_count?: number
  illustration_send_count?: number
  review_token?: string | null
  send_count?: number
}

interface ProjectHeaderProps {
  projectId: string
  projectInfo: ProjectInfo
  pageCount: number
  characterCount: number
  hasImages?: boolean
  isTrialReady?: boolean
  onCreateIllustrations?: () => void
  generatedIllustrationCount?: number
  centerContent?: React.ReactNode
  hasUnresolvedFeedback?: boolean
  hasResolvedFeedback?: boolean
}

// Define clear stage configuration
interface StageConfig {
  tag: string
  tagStyle: string
  buttonLabel: string
  showCount: boolean
  isResend: boolean
  buttonDisabled: boolean
  isDownload?: boolean
}

// Helper to check if in illustration workflow phase
function isInIllustrationPhase(status: ProjectStatus): boolean {
  return [
    'characters_approved',
    'sketches_review', 'sketches_revision',
    'illustration_approved',
    // Legacy statuses (for migration compatibility)
    'trial_review', 'trial_revision', 'trial_approved',
    'illustrations_generating',
    'illustration_review', 'illustration_revision_needed'
  ].includes(status)
}

export function ProjectHeader({ projectId, projectInfo, pageCount, characterCount, hasImages = false, isTrialReady = false, onCreateIllustrations, generatedIllustrationCount = 0, centerContent, hasUnresolvedFeedback = false, hasResolvedFeedback = false }: ProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [isSendingToCustomer, setIsSendingToCustomer] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Hydration fix
  useEffect(() => {
    setMounted(true)
  }, [])

  const status = projectInfo.status
  const sendCount = projectInfo.illustration_send_count || 0

  // ------------------------------------------------------------------
  // STAGE CONFIGURATION LOGIC - ILLUSTRATION WORKFLOW
  // ------------------------------------------------------------------
  const getStageConfig = (): StageConfig => {
    // ============================================================
    // ILLUSTRATION PHASE STAGES (Simplified - No Trial)
    // ============================================================
    // Flow: characters_approved → [generate all] → sketches_review → illustration_approved

    // STAGE: Characters Approved → Ready to generate all pages
    // Admin generates page 1 first, then rest. Button disabled until ALL generated.
    if (status === 'characters_approved' || 
        // Legacy statuses: treat as "generating" phase
        status === 'trial_review' || status === 'trial_revision' || 
        status === 'trial_approved' || status === 'illustrations_generating') {
      const allPagesGenerated = generatedIllustrationCount >= pageCount
      const page1Generated = generatedIllustrationCount >= 1
      
      let tag = 'Ready to Generate'
      let tagStyle = 'bg-green-100 text-green-800 border-green-300'
      
      if (page1Generated && !allPagesGenerated) {
        tag = 'Generating...'
        tagStyle = 'bg-purple-100 text-purple-800 border-purple-300'
      } else if (allPagesGenerated) {
        tag = 'Sketches Ready'
        tagStyle = 'bg-green-100 text-green-800 border-green-300'
      }
      
      return {
        tag,
        tagStyle,
        buttonLabel: 'Send Sketches',
        showCount: false,
        isResend: false,
        buttonDisabled: !allPagesGenerated
      }
    }

    // STAGE: All sketches sent, waiting for customer review
    // (Legacy: illustration_review)
    if (status === 'sketches_review' || status === 'illustration_review') {
      return {
        tag: hasUnresolvedFeedback ? 'Sketches Feedback' : 'Wait: Sketches Review',
        tagStyle: hasUnresolvedFeedback 
          ? 'bg-yellow-100 text-yellow-800 border-yellow-300' 
          : 'bg-blue-100 text-blue-800 border-blue-300',
        buttonLabel: 'Resend Sketches',
        showCount: true,
        isResend: true,
        buttonDisabled: !hasResolvedFeedback
      }
    }

    // STAGE: Customer requested sketches revision
    // (Legacy: illustration_revision_needed)
    if (status === 'sketches_revision' || status === 'illustration_revision_needed') {
      return {
        tag: 'Sketches Feedback',
        tagStyle: 'bg-orange-100 text-orange-800 border-orange-300',
        buttonLabel: 'Resend Sketches',
        showCount: true,
        isResend: true,
        buttonDisabled: !hasResolvedFeedback
      }
    }

    // STAGE: All sketches approved - FINAL
    if (status === 'illustration_approved') {
      return {
        tag: 'Sketches Approved',
        tagStyle: 'bg-green-100 text-green-800 border-green-300',
        buttonLabel: 'Download Illustrations',
        showCount: false,
        isResend: false,
        buttonDisabled: false,
        isDownload: true
      }
    }

    // ============================================================
    // CHARACTER PHASE STAGES
    // ============================================================
    const charSendCount = projectInfo.character_send_count || 0

    // Waiting for customer character review
    if (status === 'character_review' && charSendCount > 0) {
      return {
        tag: hasUnresolvedFeedback ? 'Customer Feedback Received' : 'Waiting for Review',
        tagStyle: hasUnresolvedFeedback ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-blue-100 text-blue-800 border-blue-300',
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: !hasUnresolvedFeedback
      }
    }

    // Characters regenerated, ready to resend
    if (status === 'characters_regenerated') {
      if (charSendCount === 0) {
        return {
          tag: 'Characters Generated',
          tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
          buttonLabel: 'Send Characters',
          showCount: false,
          isResend: false,
          buttonDisabled: false
        }
      } else {
        return {
          tag: 'Characters Regenerated',
          tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
          buttonLabel: 'Resend Characters',
          showCount: true,
          isResend: true,
          buttonDisabled: false
        }
      }
    }

    // Customer requested character revision
    if (status === 'character_revision_needed') {
      return {
        tag: 'Regenerate Characters',
        tagStyle: 'bg-red-100 text-red-800 border-red-300',
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: true
      }
    }

    // Generating characters
    if (status === 'character_generation') {
      return {
        tag: 'Generating Characters',
        tagStyle: 'bg-blue-100 text-blue-800 border-blue-300',
        buttonLabel: charSendCount > 0 ? 'Resend Characters' : 'Send Characters',
        showCount: charSendCount > 0,
        isResend: charSendCount > 0,
        buttonDisabled: true
      }
    }

    // Characters generation complete
    if (status === 'character_generation_complete') {
      if (charSendCount > 0) {
        return {
          tag: 'Characters Regenerated',
          tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
          buttonLabel: 'Resend Characters',
          showCount: true,
          isResend: true,
          buttonDisabled: false
        }
      }
      return {
        tag: 'Characters Generated',
        tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        buttonLabel: 'Send Characters',
        showCount: false,
        isResend: false,
        buttonDisabled: false
      }
    }

    // Has images but never sent
    if (hasImages && charSendCount === 0) {
      return {
        tag: 'Characters Generated',
        tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        buttonLabel: 'Send Characters',
        showCount: false,
        isResend: false,
        buttonDisabled: false
      }
    }
    
    // Has images and already sent
    if (hasImages && charSendCount > 0) {
      return {
        tag: 'Characters Ready',
        tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: false
      }
    }

    // Default: Project setup
    return {
      tag: 'Project Setup',
      tagStyle: 'bg-gray-100 text-gray-800 border-gray-300',
      buttonLabel: 'Request Input',
      showCount: false,
      isResend: false,
      buttonDisabled: false
    }
  }

  const stage = getStageConfig()
  
  // For character phase, use character_send_count for display
  // For illustration phase, show revision round (sendCount - 1 for resends, since first send = round 0)
  const displayCount = isInIllustrationPhase(status) 
    ? Math.max(0, sendCount - 1) // Revision rounds start from 0
    : (projectInfo.character_send_count || 0)
  
  const buttonDisplayLabel = isSendingToCustomer 
    ? 'Sending...' 
    : isDownloading 
      ? 'Downloading...' 
      : stage.buttonLabel

  // Realtime Subscription for Admin Status Updates
  useEffect(() => {
    const supabase = createClient()
    const channelName = `admin-project-status-${projectId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`
        },
        (payload) => {
          const newProject = payload.new as any
          const oldProject = payload.old as any
          
          // Only refresh when status actually changes
          if (oldProject?.status !== newProject.status) {
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Poll project status to detect when character identification completes
  const { status: currentStatus, isLoading: isCharactersLoading } = useProjectStatus(
    projectId,
    projectInfo.status
  )

  // Read active tab from search params
  const activeTab = searchParams?.get('tab') || 'pages'

  // Check if Illustrations tab is unlocked
  const isIllustrationsUnlocked = isInIllustrationPhase(status)

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations', e?: React.MouseEvent) => {
    if (e) e.preventDefault()
    if (tab === 'characters' && isCharactersLoading) return

    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('tab', tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const handleDownloadIllustrations = async () => {
    if (isDownloading) return

    setIsDownloading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/download-illustrations`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download illustrations')
      }

      const blob = await response.blob()
      
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'illustrations.zip'
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Download started!', {
        description: `Downloading ${filename}`,
      })
    } catch (error: any) {
      toast.error('Failed to download illustrations', {
        description: error.message || 'An error occurred',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleSendToCustomer = async () => {
    if (stage.buttonDisabled || isSendingToCustomer) return

    if (stage.isDownload) {
      handleDownloadIllustrations()
      return
    }

    if (stage.buttonLabel === 'Create Illustrations') {
      if (onCreateIllustrations) {
        onCreateIllustrations()
      } else {
        toast.info("Illustration setup is coming soon")
      }
      return
    }

    setIsSendingToCustomer(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/send-to-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send project to customer')
      }

      const data = await response.json()
      toast.success(stage.isResend ? 'Project resent to customer' : 'Project sent to customer review', {
        description: `Review URL: ${data.reviewUrl}`,
      })
      
      router.refresh()
    } catch (error: any) {
      toast.error('Failed to send project to customer', {
        description: error.message || 'An error occurred',
      })
    } finally {
      setIsSendingToCustomer(false)
    }
  }

  const handleDashboardClick = () => router.push('/admin/dashboard')

  // Determine current tab for display
  const currentTab = activeTab || (isIllustrationsUnlocked ? 'illustrations' : 'pages')

  // Construct Tabs
  const tabs: Array<{
    id: string
    label: string
    icon: React.ReactNode
    onClick: () => void
    count: number
    disabled?: boolean
  }> = [
    {
      id: 'pages',
      label: 'Pages',
      icon: <FileText className="w-4 h-4" />,
      onClick: () => handleTabClick('pages'),
      count: pageCount
    }
  ]

  // Only show Characters tab if there are secondary characters (count > 1 means main + secondary)
  if (characterCount > 1) {
    tabs.push({
      id: 'characters',
      label: 'Characters',
      icon: <Loader2 className="w-4 h-4" />,
      onClick: () => handleTabClick('characters'),
      count: characterCount,
      disabled: isCharactersLoading
    })
  }

  if (isIllustrationsUnlocked) {
    tabs.push({
      id: 'illustrations',
      label: 'Illustrations',
      icon: <Sparkles className="w-4 h-4 text-purple-600" />,
      onClick: () => handleTabClick('illustrations'),
      count: 0
    })
  }

  return (
    <SharedProjectHeader
      projectTitle={projectInfo.book_title}
      authorName={`${projectInfo.author_firstname} ${projectInfo.author_lastname}'s Project`}
      currentTabId={currentTab}
      tabs={tabs}
      dashboardLink={{
        label: 'Dashboard',
        href: '/admin/dashboard',
        icon: <Home className="w-4 h-4" />,
        onClick: handleDashboardClick
      }}
      centerContent={centerContent}
      statusTag={
        <span className={`hidden md:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${stage.tagStyle} shadow-sm`}>
          {stage.tag}
        </span>
      }
      actions={
        <Button
          onClick={handleSendToCustomer}
          disabled={isSendingToCustomer || isDownloading || stage.buttonDisabled}
          size="sm"
          className={`flex px-3 md:px-4 ${stage.buttonDisabled ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none' : stage.isDownload ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg' : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'} font-semibold transition-all duration-75 rounded-md whitespace-nowrap items-center justify-center h-9`}
        >
          {stage.isDownload ? (
            <Download className="w-4 h-4 md:mr-2" />
          ) : (
            <Send className="w-4 h-4 md:mr-2" />
          )}
          <span className="hidden md:inline">{buttonDisplayLabel}</span>
          <span className="md:hidden">{stage.isDownload ? 'Download' : 'Send'}</span>

          {stage.showCount && !isSendingToCustomer && displayCount > 0 && (
            <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-700">
              {displayCount}
            </span>
          )}
        </Button>
      }
    />
  )
}
