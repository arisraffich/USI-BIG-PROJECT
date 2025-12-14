'use client'

import { UnifiedHeaderShell } from '@/components/layout/UnifiedHeaderShell'
import { SharedProjectHeader } from '@/components/layout/SharedProjectHeader'
import { useTransition, useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Loader2, Send, Menu, FileText, Sparkles, ArrowLeft } from 'lucide-react'
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
}

// Define clear stage configuration
interface StageConfig {
  tag: string
  tagStyle: string
  buttonLabel: string
  showCount: boolean
  isResend: boolean
  buttonDisabled: boolean
}

export function ProjectHeader({ projectId, projectInfo, pageCount, characterCount, hasImages = false, isTrialReady = false, onCreateIllustrations }: ProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [isSendingToCustomer, setIsSendingToCustomer] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Hydration fix
  useEffect(() => {
    setMounted(true)
  }, [])

  const isIllustrationMode = ['illustration_review', 'illustration_revision_needed'].includes(projectInfo.status)
  const sendCount = isIllustrationMode
    ? (projectInfo.illustration_send_count || 0)
    : (projectInfo.character_send_count || 0)

  // ------------------------------------------------------------------
  // STAGE CONFIGURATION LOGIC
  // ------------------------------------------------------------------
  const getStageConfig = (): StageConfig => {
    const status = projectInfo.status

    // STAGE 5: Characters Approved (Ready for Trial)
    if (status === 'characters_approved') {
      return {
        tag: 'Trial Illustration',
        tagStyle: 'bg-green-100 text-green-800 border-green-300',
        buttonLabel: 'Send Trial',
        showCount: false,
        isResend: false,
        buttonDisabled: !isTrialReady
      }
    }

    // STAGE 6: Illustration Review (Sent)
    if (status === 'illustration_review') {
      return {
        tag: 'Waiting for Review',
        tagStyle: 'bg-blue-100 text-blue-800 border-blue-300',
        buttonLabel: 'Resend Trial',
        showCount: true, // Use illustration_send_count from projectInfo
        isResend: true,
        buttonDisabled: true
      }
    }

    // STAGE 7: Revision Needed
    if (status === 'illustration_revision_needed') {
      return {
        tag: 'Action Required',
        tagStyle: 'bg-orange-100 text-orange-800 border-orange-300',
        buttonLabel: 'Resend Trial',
        showCount: true,
        isResend: true,
        buttonDisabled: false
      }
    }

    // STAGE 5.5: Waiting for Review (Sent to Customer)
    if (status === 'character_review' && sendCount > 0) {
      return {
        tag: 'Waiting for Review',
        tagStyle: 'bg-blue-100 text-blue-800 border-blue-300',
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: true
      }
    }

    // STAGE 4: Characters Regenerated (Ready to Resend)
    if (status === 'characters_regenerated') {
      if (sendCount === 0) {
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

    // STAGE 3: Revision Needed
    // (Customer requested changes, or we are in revision loop)
    if (status === 'character_revision_needed') {
      return {
        tag: 'Regenerate Characters',
        tagStyle: 'bg-red-100 text-red-800 border-red-300',
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: true // Disabled until regenerated
      }
    }

    // STAGE 2.5: Characters Generated (Explicit Status)
    // This handles cases where status is explicitly set (e.g. after customer submission), regardless of send count
    if (status === 'character_generation_complete') {
      return {
        tag: 'Characters Generated',
        tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        buttonLabel: 'Send Characters',
        showCount: false,
        isResend: sendCount > 0,
        buttonDisabled: false
      }
    }

    // STAGE 2: Images Ready (First Time Implicit)
    // Condition: Has images, but never sent (count 0) and status isn't explicit
    if (hasImages && sendCount === 0) {
      return {
        tag: 'Characters Generated',
        tagStyle: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        buttonLabel: 'Send Characters',
        showCount: false,
        isResend: false,
        buttonDisabled: false
      }
    }

    // STAGE 1: Project Creation / Setup (Default)
    // Condition: No images yet
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
  const buttonDisplayLabel = isSendingToCustomer ? 'Sending...' : stage.buttonLabel

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

          if (newProject.status === 'characters_approved') {
            toast.success('Characters Approved!', {
              description: 'The customer has approved the characters. Illustrations unlocked.'
            })
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

  // Read active tab from search params - synchronous, instant
  const activeTab = searchParams?.get('tab') || 'pages'
  const isPagesActive = activeTab === 'pages'
  const isCharactersActive = activeTab === 'characters'
  const isIllustrationsActive = activeTab === 'illustrations'

  // Check if Illustrations are unlocked
  const isIllustrationsUnlocked = projectInfo.status === 'characters_approved' ||
    projectInfo.status === 'sketch_generation' ||
    projectInfo.status === 'sketch_ready' ||
    projectInfo.status === 'illustration_review' ||
    projectInfo.status === 'illustration_revision_needed' ||
    projectInfo.status === 'illustration_approved' ||
    projectInfo.status === 'completed'

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations', e?: React.MouseEvent) => {
    if (e) e.preventDefault()
    if (tab === 'characters' && isCharactersLoading) return

    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('tab', tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const handleSendToCustomer = async () => {
    if (stage.buttonDisabled || isSendingToCustomer) return

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
      console.error('Error sending to customer:', error)
      toast.error('Failed to send project to customer', {
        description: error.message || 'An error occurred',
      })
    } finally {
      setIsSendingToCustomer(false)
    }
  }

  const setActiveTab = (tabId: string) => handleTabClick(tabId as any)

  // --- Unified Header Content ---
  const statusColor = 'bg-blue-100 text-blue-800 border-blue-200'
  const statusLabel = projectInfo.status.replace(/_/g, ' ')

  // Determine default tab logic
  // If no tab param, and illustrations unlocked, default to illustrations?
  // User said "In illustration stage illustraiton page is by default open."
  // We can do this by checking if we are in illustration mode and tab is missing.

  useEffect(() => {
    if (!searchParams?.get('tab') && isIllustrationsUnlocked) {
      // We can't easily "redirect" here without causing a loop if not careful, 
      // but simply handling the *default* rendering or active state is safer.
      // However, the `activeTab` variable is derived from searchParams.
      // Let's force a replace if needed, or just treat 'undefined' as 'illustrations' in that case.
      // Better: treat it in render logic, but user might want URL update.
      // For now, let's update the `currentTab` derivation.
    }
  }, [isIllustrationsUnlocked, searchParams])

  // Improved derivation of current tab for display
  const currentTab = activeTab || (isIllustrationsUnlocked ? 'illustrations' : 'pages')
  const sectionTitle = currentTab.charAt(0).toUpperCase() + currentTab.slice(1)

  // ... (previous logic for stages, hooks, etc. remains same) ...

  const handleDashboardClick = () => router.push('/admin/dashboard')

  // Construct Tabs
  const tabs = [
    {
      id: 'pages',
      label: 'Pages',
      icon: <FileText className="w-4 h-4" />,
      onClick: () => handleTabClick('pages'),
      count: pageCount
    },
    {
      id: 'characters',
      label: 'Characters',
      icon: <Loader2 className="w-4 h-4" />,
      onClick: () => handleTabClick('characters'),
      count: characterCount,
      disabled: isCharactersLoading
    }
  ]

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
      statusTag={
        <span className={`hidden md:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${stage.tagStyle} shadow-sm`}>
          {stage.tag}
        </span>
      }
      actions={
        <Button
          onClick={handleSendToCustomer}
          disabled={isSendingToCustomer || stage.buttonDisabled}
          size="sm"
          className={`flex px-3 md:px-4 ${stage.buttonDisabled ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none' : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'} font-semibold transition-all duration-75 rounded-md whitespace-nowrap items-center justify-center h-9`}
        >
          <Send className="w-4 h-4 md:mr-2" />
          <span className="hidden md:inline">{buttonDisplayLabel}</span>
          <span className="md:hidden">Send</span>

          {stage.showCount && !isSendingToCustomer && sendCount > 0 && (
            <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-700">
              {sendCount}
            </span>
          )}
        </Button>
      }
    />
  )
}

// -------------------------------------------------------------
// IMPORTS NEED TO BE UPDATED
// -------------------------------------------------------------
// I need shorter replacement chunks or replace full file.
// I will replace full file content basically, or key parts.
// Actually, `ProjectHeader` is huge (400 lines). I should define `tabs` inside component and just replace the `return (...)`.
// But I need to import `SharedProjectHeader`.

