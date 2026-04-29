'use client'

import { useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Check, Loader2, FileText, Sparkles } from 'lucide-react'
import { MobilePageNavigator } from '@/components/ui/mobile-page-navigator'
import { Badge } from '@/components/ui/badge'
import { SharedProjectHeader } from '@/components/layout/SharedProjectHeader'

interface CustomerProjectHeaderProps {
  projectTitle: string
  authorName: string
  pageCount: number
  characterCount: number
  isSubmitting: boolean
  onSubmit: () => void
  showSubmitButton?: boolean
  isSubmitDisabled?: boolean
  hideOnMobile?: boolean
  onApprove?: () => void
  isApproving?: boolean
  showApproveButton?: boolean
  isApproveDisabled?: boolean
  showIllustrationsTab?: boolean
  projectStatus?: string
  illustrationSendCount?: number
  approvalStage?: 'sketch' | 'illustration'
  approvalApprovedCount?: number
  approvalTotalCount?: number
  approvalAllApproved?: boolean
}

export function CustomerProjectHeader({
  projectTitle,
  authorName,
  pageCount,
  characterCount,
  isSubmitting,
  onSubmit,
  showSubmitButton = true,
  isSubmitDisabled = false,
  onApprove,
  isApproving = false,
  showApproveButton = false,
  isApproveDisabled = false,
  showIllustrationsTab = false,
  projectStatus,
  approvalStage = 'sketch',
  approvalApprovedCount = 0,
  approvalTotalCount = 0,
  approvalAllApproved = false
}: CustomerProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  // Read active tab from search params
  const activeTab = searchParams?.get('tab')
  const isCharactersActive = activeTab === 'characters'
  const isIllustrationsActive = activeTab === 'illustrations'
  const isPagesActive = !isCharactersActive && !isIllustrationsActive

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations') => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('tab', tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

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
      count: characterCount
    }
  ]

  if (showIllustrationsTab) {
    tabs.push({
      id: 'illustrations',
      label: 'Illustrations',
      icon: <Sparkles className="w-4 h-4 text-purple-600" />,
      onClick: () => handleTabClick('illustrations'),
      count: 0
    })
  }

  const currentTabId = isIllustrationsActive ? 'illustrations' : (isCharactersActive ? 'characters' : 'pages')
  const isCompleted = projectStatus === 'completed'
  const isApprovedStage = isCompleted || (approvalStage === 'sketch' && (projectStatus === 'illustration_approved' || approvalAllApproved)) || (approvalStage === 'illustration' && approvalAllApproved)
  const approveButtonText = 'APPROVE SKETCHES'
  const approvedButtonText = approvalStage === 'illustration' ? 'ILLUSTRATIONS APPROVED' : 'SKETCHES APPROVED'
  const progressLabel = approvalStage === 'illustration' ? 'Illustrations approved' : 'Sketches approved'
  const progressPercent = approvalTotalCount > 0 ? Math.round((approvalApprovedCount / approvalTotalCount) * 100) : 0
  const showTopIllustrationApproveButton = approvalStage === 'sketch' || isApprovedStage
  
  // Determine status badge text based on project status
  const getStatusBadgeText = () => {
    if (projectStatus === 'sketches_review' || projectStatus === 'sketches_revision') return 'Sketches Review'
    if (projectStatus === 'illustration_approved') return 'Sketches Approved'
    if (projectStatus === 'completed') return 'Completed'
    // Legacy statuses (for migration compatibility)
    if (projectStatus === 'trial_review' || projectStatus === 'trial_revision') return 'Sketches Review'
    if (projectStatus === 'trial_approved' || projectStatus === 'illustrations_generating') return 'Sketches Review'
    if (projectStatus === 'illustration_review' || projectStatus === 'illustration_revision_needed') return 'Sketches Review'
    return 'Review'
  }
  

  return (
    <>
      <SharedProjectHeader
          projectTitle={projectTitle}
          authorName={`${authorName}'s Project`}
          currentTabId={currentTabId}
          tabs={tabs}
          titleActions={
            showIllustrationsTab && showSubmitButton && showTopIllustrationApproveButton ? (
              <Button
                onClick={onSubmit}
                disabled={isSubmitting || isSubmitDisabled || isApprovedStage}
                size="sm"
                className="h-8 bg-green-600 hover:bg-green-700 text-white shadow-sm transition-all font-semibold uppercase disabled:opacity-100"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    SUBMITTING...
                  </>
                ) : isApprovedStage ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {approvedButtonText}
                  </>
                ) : (
                  approveButtonText
                )}
              </Button>
            ) : null
          }
          mobileTitleActions={null}
          mobileBottomContent={
            showIllustrationsTab && showSubmitButton && approvalTotalCount > 0 ? (
              <div className="w-full space-y-1.5">
                <div className="text-center text-[11px] font-semibold text-slate-600 leading-none">
                  {progressLabel} {approvalApprovedCount}/{approvalTotalCount}
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700 ease-out"
                    style={{ width: progressPercent + '%' }}
                  />
                </div>
              </div>
            ) : null
          }
          middleContent={
            showIllustrationsTab && showSubmitButton && approvalTotalCount > 0 ? (
              <div className="flex w-full flex-col items-center gap-1.5">
                <div className="text-xs font-semibold text-slate-600 leading-none">
                  {progressLabel} {approvalApprovedCount}/{approvalTotalCount}
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700 ease-out"
                    style={{ width: progressPercent + '%' }}
                  />
                </div>
              </div>
            ) : null
          }
          centerContent={
            <>
              {/* Approve Characters Button (Desktop - Centered) */}
              {showApproveButton && onApprove && (
                <Button
                  onClick={onApprove}
                  disabled={isApproving || isApproveDisabled}
                  size="default"
                  className="hidden md:flex bg-green-600 hover:bg-green-700 text-white shadow-md transition-all font-bold uppercase tracking-wide"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      APPROVING...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      APPROVE CHARACTERS
                    </>
                  )}
                </Button>
              )}

              {/* Submit Forms Button (Desktop - Centered) */}
              {showSubmitButton && !showIllustrationsTab && !showApproveButton && (
                <Button
                  onClick={onSubmit}
                  disabled={isSubmitting || isSubmitDisabled}
                  size="default"
                  className="hidden md:flex bg-green-600 hover:bg-green-700 text-white shadow-md transition-all font-bold uppercase tracking-wide"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      SUBMITTING...
                    </>
                  ) : (
                    "SUBMIT FORMS"
                  )}
                </Button>
              )}
            </>
          }
          statusTag={
            showIllustrationsTab && isIllustrationsActive ? (
              <Badge variant="secondary" className="hidden lg:flex bg-blue-50 text-blue-700 border-blue-200">
                {getStatusBadgeText()}
              </Badge>
            ) : null
          }
          actions={
            <>
              {/* Approve Button (Mobile - Right Aligned) */}
              {showApproveButton && onApprove && (
                <Button
                  onClick={onApprove}
                  disabled={isApproving || isApproveDisabled}
                  size="default"
                  className="md:hidden bg-green-600 hover:bg-green-700 text-white shadow-md transition-all font-bold uppercase tracking-wide"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      APPROVING...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      APPROVE
                    </>
                  )}
                </Button>
              )}

              {/* Submit Button (Pages/General - Mobile Only) */}
              {showSubmitButton && !showIllustrationsTab && (
                <Button
                  onClick={onSubmit}
                  disabled={isSubmitting || isSubmitDisabled}
                  size="sm"
                  className="md:hidden bg-green-600 hover:bg-green-700 text-white shadow-md transition-all font-semibold uppercase"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      SUBMITTING...
                    </>
                  ) : (
                    "SUBMIT FORMS"
                  )}
                </Button>
              )}

            </>
          }
        />

      {/* Mobile Page Navigator - Only show when NOT on illustrations tab (illustrations has its own nav) */}
      {isPagesActive && (
        <MobilePageNavigator
          currentPage={1}
          totalPages={pageCount}
          onPageSelect={() => handleTabClick('pages')}
          disabled={!showIllustrationsTab}
        />
      )}
    </>
  )
}







