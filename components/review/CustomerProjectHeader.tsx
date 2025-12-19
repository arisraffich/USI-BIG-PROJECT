'use client'

import { useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Check, Loader2, FileText, Sparkles, Send } from 'lucide-react'
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
  hideOnMobile = false,
  onApprove,
  isApproving = false,
  showApproveButton = false,
  isApproveDisabled = false,
  showIllustrationsTab = false,
  projectStatus
}: CustomerProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // Read active tab from search params
  const activeTab = searchParams?.get('tab')
  const isCharactersActive = activeTab === 'characters'
  const isIllustrationsActive = activeTab === 'illustrations'
  const isPagesActive = !isCharactersActive && !isIllustrationsActive

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations') => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (tab === 'pages') {
        params.delete('tab')
      } else {
        params.set('tab', tab)
      }
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
  const isApprovedStage = projectStatus === 'illustration_approved' || projectStatus === 'illustration_production' || projectStatus === 'completed'

  return (
    <>
      <SharedProjectHeader
          projectTitle={projectTitle}
          authorName={`${authorName}'s Project`}
          currentTabId={currentTabId}
          tabs={tabs}
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

              {/* Approve Illustrations Button (Centered) */}
              {showIllustrationsTab && showSubmitButton && (
                <Button
                  onClick={onSubmit}
                  disabled={isSubmitting || isSubmitDisabled || isApprovedStage}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white shadow-md transition-all font-semibold uppercase"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      SUBMITTING...
                    </>
                  ) : isApprovedStage ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      1ST ILLUSTRATION APPROVED
                    </>
                  ) : (
                    "APPROVE ILLUSTRATIONS"
                  )}
                </Button>
              )}
            </>
          }
          statusTag={
            showIllustrationsTab && isIllustrationsActive ? (
              <Badge variant="secondary" className="hidden lg:flex bg-blue-50 text-blue-700 border-blue-200">
                Trial Stage
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

              {/* Approve Illustration Button (Mobile Only - shown in actions) */}
              {showIllustrationsTab && showSubmitButton && (
                <div className="md:hidden">
                  <Button
                    onClick={onSubmit}
                    disabled={isSubmitting || isSubmitDisabled || isApprovedStage}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white shadow-md transition-all font-semibold uppercase"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        SUBMITTING...
                      </>
                    ) : isApprovedStage ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        1ST ILLUSTRATION APPROVED
                      </>
                    ) : (
                      "APPROVE ILLUSTRATIONS"
                    )}
                  </Button>
                </div>
              )}
            </>
          }
        />

      {/* Mobile Page Navigator */}
      {!activeTab && (
        <MobilePageNavigator
          currentPage={1}
          totalPages={pageCount}
          onPageSelect={() => handleTabClick('pages')}
          disabled={!showIllustrationsTab}
        />
      )}
      {activeTab === 'illustrations' && (
        <MobilePageNavigator
          currentPage={1}
          totalPages={pageCount}
          onPageSelect={() => handleTabClick('illustrations')}
          disabled={!showIllustrationsTab}
        />
      )}
    </>
  )
}



