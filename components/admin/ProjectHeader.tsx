'use client'

import { useTransition, useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Loader2, Send, Menu, FileText, Sparkles } from 'lucide-react'
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
            // console.log('[Admin Realtime] Characters Approved! Refreshing...')
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
  const activeTab = searchParams?.get('tab')
  const isPagesActive = !activeTab || activeTab === 'pages'
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

    // Prevent switching to Characters tab while loading
    if (tab === 'characters' && isCharactersLoading) {
      return
    }

    // Use startTransition to make URL update non-blocking - instant UI response
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

      // Refresh the page to update status
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

  // Determine Section Title (was mobileTitle)
  // Default logic must match ProjectTabsContent
  const currentTab = activeTab || (isIllustrationsUnlocked ? 'illustrations' : 'pages')
  const sectionTitle = currentTab.charAt(0).toUpperCase() + currentTab.slice(1)

  return (
    <>
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b-2 border-blue-200 shadow-lg pl-8 fixed top-0 left-0 right-0 z-50 pt-[16px] pr-[42px] pb-[16px]">
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2 md:gap-4">
            {mounted ? (
              <DropdownMenu key="client-menu">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-sm font-medium text-gray-900 flex items-center gap-2 hover:bg-white/50 px-2 -ml-2">
                    <span className="hidden md:block truncate max-w-[200px] md:max-w-xs">{sectionTitle}</span>
                    <Menu className="w-4 h-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px]">
                  <DropdownMenuItem onClick={() => router.push('/admin/dashboard')}>
                    <Home className="w-4 h-4 mr-2" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTabClick('pages')}>
                    <FileText className="w-4 h-4 mr-2" />
                    Pages
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleTabClick('characters')}
                    disabled={isCharactersLoading}
                  >
                    <Loader2 className={`w-4 h-4 mr-2 ${isCharactersLoading ? 'animate-spin' : ''}`} />
                    Characters
                  </DropdownMenuItem>
                  {isIllustrationsUnlocked && (
                    <DropdownMenuItem onClick={() => handleTabClick('illustrations')}>
                      <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                      Illustrations
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button key="server-fallback" variant="ghost" className="text-sm font-medium text-gray-900 flex items-center gap-2 hover:bg-white/50 px-2 -ml-2">
                <span className="hidden md:block truncate max-w-[200px] md:max-w-xs">{sectionTitle}</span>
                <Menu className="w-4 h-4 text-gray-500" />
              </Button>
            )}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center -mt-[16px] -mb-[16px]">
            {/* Desktop Tabs - Only show in earlier stages (before illustrations unlocked) */}
            {!isIllustrationsUnlocked && (
              <div className="hidden md:flex h-full items-center">
                <Button
                  variant="outline"
                  onClick={(e) => handleTabClick('pages', e)}
                  className={`h-full rounded-none w-[140px] m-0 ${isPagesActive ? 'bg-blue-600 hover:bg-blue-700 text-white hover:text-white border-0 shadow-lg hover:shadow-xl' : 'bg-white border-0 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-blue-700 hover:text-blue-800'} box-border font-semibold text-lg transition-colors duration-75 cursor-pointer`}
                >
                  <span>Pages</span>
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isPagesActive ? 'bg-white/30 text-white hover:text-white' : 'bg-blue-100 text-blue-700'}`}>{pageCount ?? 0}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => handleTabClick('characters', e)}
                  disabled={isCharactersLoading}
                  className={`h-full rounded-none w-[140px] m-0 ${isCharactersLoading ? 'opacity-70 cursor-not-allowed bg-yellow-50 border-yellow-300' : ''} ${isCharactersActive && !isCharactersLoading ? 'bg-blue-600 hover:bg-blue-700 text-white hover:text-white border-0 shadow-lg hover:shadow-xl' : isCharactersActive && isCharactersLoading ? 'bg-yellow-100 border-yellow-400' : 'bg-white border-0 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-blue-700 hover:text-blue-800'} box-border font-semibold text-lg transition-colors duration-75 ${isCharactersLoading ? '' : 'cursor-pointer'}`}
                >
                  <span className="flex items-center gap-1.5">
                    {isCharactersLoading && (
                      <Loader2 className="w-4 h-4 animate-spin text-yellow-600" />
                    )}
                    Characters
                    {isCharactersLoading && (
                      <span className="text-xs text-yellow-700 font-normal">(Loading...)</span>
                    )}
                  </span>
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isCharactersActive && !isCharactersLoading ? 'bg-white/30 text-white hover:text-white' : isCharactersLoading ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-100 text-blue-700'}`}>
                    {isCharactersLoading ? '...' : (characterCount ?? 0)}
                  </span>
                </Button>
              </div>
            )}
            {/* Removed Mobile Centered Button */}
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <span
              className={`hidden md:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${stage.tagStyle} shadow-sm`}
            >
              {stage.tag}
            </span>

            {/* Combined Send Button (Mobile & Desktop) */}
            <Button
              onClick={handleSendToCustomer}
              disabled={isSendingToCustomer || stage.buttonDisabled}
              size="sm"
              className={`flex px-3 md:px-4 ${stage.buttonDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white border-0 shadow-md hover:shadow-lg font-semibold transition-all duration-75 rounded-md whitespace-nowrap items-center justify-center h-9`}
            >
              <Send className="w-4 h-4 md:mr-2" />
              <span className="ml-2 md:ml-0 md:inline hidden">{buttonDisplayLabel}</span>
              <span className="ml-2 md:hidden inline">Send</span>

              {stage.showCount && !isSendingToCustomer && sendCount > 0 && (
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-700">
                  {sendCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {/* Mobile Bottom Navigation Bar (Filmstrip) */}
      {!isCharactersActive && (
        <MobilePageNavigator
          currentPage={1} // TODO: Connect to active page state when multi-page is enabled
          totalPages={pageCount}
          onPageSelect={(page) => {
            handleTabClick('pages')
            // TODO: Scroll to page logic
            toast.info(`Page ${page} selected`, { duration: 1000 })
          }}
          disabled={!isIllustrationsUnlocked || stage.tag === 'Trial Illustration'} // Inactive during trial as requested
        />
      )}
    </>
  )
}
