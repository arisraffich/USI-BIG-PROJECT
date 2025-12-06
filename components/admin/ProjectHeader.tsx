'use client'

import { useTransition, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Loader2, Send } from 'lucide-react'
import { ProjectStatus } from '@/types/project'
import { useProjectStatus } from '@/hooks/use-project-status'
import { toast } from 'sonner'

interface ProjectInfo {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  status: ProjectStatus
  character_send_count?: number
  review_token?: string | null
}

interface ProjectHeaderProps {
  projectId: string
  projectInfo: ProjectInfo
  pageCount: number
  characterCount: number
}

export function ProjectHeader({ projectId, projectInfo, pageCount, characterCount }: ProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [isSendingToCustomer, setIsSendingToCustomer] = useState(false)

  const sendCount = projectInfo.character_send_count || 0
  const isResend = sendCount > 0 || !!projectInfo.review_token

  // Poll project status to detect when character identification completes
  const { status: currentStatus, isLoading: isCharactersLoading } = useProjectStatus(
    projectId,
    projectInfo.status
  )

  // Read active tab from search params - synchronous, instant
  const activeTab = searchParams?.get('tab')
  const isPagesActive = activeTab !== 'characters'
  const isCharactersActive = activeTab === 'characters'

  const handleTabClick = (tab: 'pages' | 'characters', e: React.MouseEvent) => {
    e.preventDefault()

    // Prevent switching to Characters tab while loading
    if (tab === 'characters' && isCharactersLoading) {
      return
    }

    // Use startTransition to make URL update non-blocking - instant UI response
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (tab === 'characters') {
        params.set('tab', 'characters')
      } else {
        params.delete('tab')
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  // Format status for display
  const formatStatus = (status: ProjectStatus): string => {
    if (status === 'character_generation_complete') {
      return 'Character Generated'
    }
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Get status badge styling based on status
  const getStatusStyles = (status: ProjectStatus): string => {
    if (status === 'completed') {
      return 'bg-green-100 text-green-800 border-green-300'
    }
    if (status === 'character_revision_needed') {
      return 'bg-red-100 text-red-800 border-red-300'
    }
    if (status.includes('approved') || status === 'sketch_ready') {
      return 'bg-blue-100 text-blue-800 border-blue-300'
    }
    if (status === 'character_review' || status === 'character_generation') {
      return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    }
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  // Check if project can be sent to customer
  // Show button when project has characters and is not actively generating or completed
  // Allow sending for draft, character_review (resend), and other intermediate statuses
  const canSendToCustomer = characterCount > 0 &&
    projectInfo.status !== 'character_generation' &&
    projectInfo.status !== 'completed'

  const handleSendToCustomer = async () => {
    if (!canSendToCustomer || isSendingToCustomer) return

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
      toast.success(isResend ? 'Project resent to customer' : 'Project sent to customer review', {
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

  return (
    <>
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b-2 border-blue-200 shadow-lg pl-8 fixed top-0 left-0 right-0 z-50 pt-[16px] pr-[42px] pb-[16px]">
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2 md:gap-4">
            <Link href="/admin/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2">
              <Home className="w-4 h-4" />
              <span className="hidden md:inline">Dashboard</span>
            </Link>
            <span className="text-gray-300 hidden md:inline">/</span>
            <p className="text-sm font-medium text-gray-900 hidden md:block">
              {projectInfo.author_firstname || ''} {projectInfo.author_lastname || ''}'s project
            </p>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center -mt-[16px] -mb-[16px]">
            {/* Desktop Tabs */}
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

            {/* Mobile Centered Send Button */}
            <div className="md:hidden flex items-center">
              {canSendToCustomer && (
                <Button
                  onClick={handleSendToCustomer}
                  disabled={isSendingToCustomer}
                  size="sm"
                  className="px-3 bg-green-600 hover:bg-green-700 text-white border-0 shadow-md hover:shadow-lg font-semibold transition-all duration-75 rounded-md whitespace-nowrap flex items-center justify-center h-9"
                >
                  <Send className="w-4 h-4 mr-2" />
                  <span>{isSendingToCustomer ? 'Sending...' : (isResend ? 'Resend Characters' : 'Send Characters')}</span>
                  {isResend && !isSendingToCustomer && sendCount > 0 && (
                    <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-700">
                      {sendCount}
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <span
              className={`hidden md:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStatusStyles(projectInfo.status)} shadow-sm`}
            >
              {formatStatus(projectInfo.status)}
            </span>

            {/* Portal Target for Mobile Actions (like Edit Manuscript) */}
            <div id="mobile-header-portal" className="flex md:hidden items-center gap-2" />

            {/* Desktop Send Button */}
            {canSendToCustomer && (
              <Button
                onClick={handleSendToCustomer}
                disabled={isSendingToCustomer}
                size="sm"
                className="hidden md:flex px-3 md:px-4 bg-green-600 hover:bg-green-700 text-white border-0 shadow-md hover:shadow-lg font-semibold transition-all duration-75 rounded-md whitespace-nowrap items-center justify-center h-9"
              >
                <Send className="w-4 h-4 md:mr-2" />
                <span className="ml-2 md:ml-0">{isSendingToCustomer ? 'Sending...' : (isResend ? 'Resend Characters' : 'Send Characters')}</span>
                {isResend && !isSendingToCustomer && sendCount > 0 && (
                  <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-700">
                    {sendCount}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden flex h-16 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button
          variant="ghost"
          onClick={(e) => handleTabClick('pages', e)}
          className={`flex-1 h-full rounded-none flex flex-col items-center justify-center gap-1 ${isPagesActive ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold">Pages</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isPagesActive ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'}`}>
              {pageCount ?? 0}
            </span>
          </div>
        </Button>
        <div className="w-px bg-blue-100 h-8 self-center"></div>
        <Button
          variant="ghost"
          onClick={(e) => handleTabClick('characters', e)}
          disabled={isCharactersLoading}
          className={`flex-1 h-full rounded-none flex flex-col items-center justify-center gap-1 ${isCharactersActive ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'} ${isCharactersLoading ? 'opacity-70 bg-gray-50' : ''}`}
        >
          <div className="flex items-center gap-1.5">
            {isCharactersLoading && <Loader2 className={`w-3 h-3 animate-spin ${isCharactersActive ? 'text-white' : ''}`} />}
            <span className="text-base font-semibold">Characters</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isCharactersActive ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'}`}>
              {isCharactersLoading ? '...' : (characterCount ?? 0)}
            </span>
          </div>
        </Button>
      </div>
    </>
  )
}
