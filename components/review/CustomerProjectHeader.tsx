'use client'

import { useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'

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
  isApproveDisabled = false
}: CustomerProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // Read active tab from search params
  const activeTab = searchParams?.get('tab')
  const isPagesActive = activeTab !== 'characters'
  const isCharactersActive = activeTab === 'characters'

  const handleTabClick = (tab: 'pages' | 'characters', e: React.MouseEvent) => {
    e.preventDefault()

    // Use startTransition to make URL update non-blocking
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

  return (
    <>
      <div className={`bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b-2 border-blue-200 shadow-lg pl-8 fixed top-0 left-0 right-0 z-50 pt-[16px] pr-[42px] pb-[16px] ${hideOnMobile ? 'hidden md:block' : ''}`}>
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2">
            <div id="mobile-header-portal" className="flex md:hidden items-center gap-2"></div>
            <h1 className="text-lg font-semibold text-gray-900 hidden md:block">{authorName}'s project</h1>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 hidden md:flex -mt-[16px] -mb-[16px]">
            <Button
              variant="outline"
              onClick={(e) => handleTabClick('pages', e)}
              className={`h-full rounded-none w-[140px] ${isPagesActive ? 'bg-blue-600 hover:bg-blue-700 text-white hover:text-white border-0 shadow-lg hover:shadow-xl' : 'bg-white border-0 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-blue-700 hover:text-blue-800'} box-border font-semibold text-lg transition-colors duration-75 cursor-pointer`}
            >
              <span>Pages</span>
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isPagesActive ? 'bg-white/30 text-white hover:text-white' : 'bg-blue-100 text-blue-700'}`}>{pageCount ?? 0}</span>
            </Button>
            <Button
              variant="outline"
              onClick={(e) => handleTabClick('characters', e)}
              className={`h-full rounded-none w-[140px] ${isCharactersActive ? 'bg-blue-600 hover:bg-blue-700 text-white hover:text-white border-0 shadow-lg hover:shadow-xl' : 'bg-white border-0 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-blue-700 hover:text-blue-800'} box-border font-semibold text-lg transition-colors duration-75 cursor-pointer`}
            >
              <span>Characters</span>
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isCharactersActive ? 'bg-white/30 text-white hover:text-white' : 'bg-blue-100 text-blue-700'}`}>{characterCount ?? 0}</span>
            </Button>
          </div>
          <div className="flex items-center gap-3 pl-4">
            <div id="mobile-header-portal-right" className="flex md:hidden items-center gap-2"></div>
            {showApproveButton && (
              <Button
                onClick={onApprove}
                disabled={isApproving || isApproveDisabled}
                className="bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1.5" />
                    Approve Characters
                  </>
                )}
              </Button>
            )}
            {showSubmitButton && (
              <div className="relative group">
                <Button
                  onClick={onSubmit}
                  disabled={isSubmitting || isSubmitDisabled}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Changes
                    </>
                  )}
                </Button>
                {/* Tooltip for disabled state */}
                {isSubmitDisabled && !isSubmitting && (
                  <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-slate-800 text-white text-xs rounded shadow-lg whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none data-[state=visible]:animate-in data-[state=visible]:fade-in data-[state=visible]:slide-in-from-top-1">
                    Please complete all character forms and all required fields before submitting.
                    <div className="absolute -top-1 right-8 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>
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
          className={`flex-1 h-full rounded-none flex flex-col items-center justify-center gap-1 ${isCharactersActive ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold">Characters</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isCharactersActive ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'}`}>
              {characterCount ?? 0}
            </span>
          </div>
        </Button>
      </div>
    </>
  )
}
