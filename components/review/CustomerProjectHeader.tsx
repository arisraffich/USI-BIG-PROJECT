'use client'

import { useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check, Loader2, Menu, FileText, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MobilePageNavigator } from '@/components/ui/mobile-page-navigator'

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
  showIllustrationsTab = false
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

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations', e: React.MouseEvent) => {
    e.preventDefault()

    // Use startTransition to make URL update non-blocking
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

  // Determine Section Title (was mobileTitle)
  const currentTab = activeTab || (showIllustrationsTab ? 'illustrations' : (activeTab === 'characters' ? 'characters' : 'pages'))
  const sectionTitle = currentTab === 'illustrations' ? 'Illustrations' : (currentTab === 'characters' ? 'Characters' : 'Pages')

  return (
    <>
      <div className={`bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b-2 border-blue-200 shadow-lg pl-8 fixed top-0 left-0 right-0 z-50 pt-[16px] pr-[42px] pb-[16px] ${hideOnMobile ? 'hidden md:block' : ''}`}>
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Dropdown Menu for Navigation (Matches Admin) */}
            <DropdownMenu key="client-menu">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-sm font-medium text-gray-900 flex items-center gap-2 hover:bg-white/50 px-2 -ml-2">
                  <span className="hidden md:block truncate max-w-[200px] md:max-w-xs">{sectionTitle}</span>
                  <Menu className="w-4 h-4 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                <DropdownMenuItem onClick={(e) => handleTabClick('pages', e)}>
                  <FileText className="w-4 h-4 mr-2" />
                  Pages
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => handleTabClick('characters', e)}
                >
                  <Loader2 className={`w-4 h-4 mr-2 ${false ? 'animate-spin' : ''}`} /> {/* Loading state not passed prop yet, simplified */}
                  Characters
                </DropdownMenuItem>
                {showIllustrationsTab && (
                  <DropdownMenuItem onClick={(e) => handleTabClick('illustrations', e)}>
                    <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                    Illustrations
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <h1 className="text-lg font-semibold text-gray-900 hidden md:block border-l border-gray-300 pl-4 ml-2">{authorName}'s project</h1>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center -mt-[16px] -mb-[16px]">
            {/* Desktop Tabs - Only show in earlier stages (before illustrations unlocked) */}
            {!showIllustrationsTab && (
              <div className="hidden md:flex h-full items-center">
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
            )}
          </div>

          <div className="flex items-center gap-3 pl-4">
            {/* Trial Stage Badge (Only for Illustrations Tab) */}
            {showIllustrationsTab && isIllustrationsActive && (
              <div className="hidden lg:flex items-center px-2.5 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold mr-2">
                Trial Stage
              </div>
            )}

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
                    <Check className="w-4 h-4 mr-2" />
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
                    Please complete all forms before submitting.
                    <div className="absolute -top-1 right-8 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (Filmstrip) */}
      {!activeTab && (
        <MobilePageNavigator
          currentPage={1} // TODO: State connection
          totalPages={pageCount}
          onPageSelect={(page) => handleTabClick('pages', { preventDefault: () => { } } as any)}
          disabled={!showIllustrationsTab}
        />
      )}
      {activeTab === 'illustrations' && (
        <MobilePageNavigator
          currentPage={1}
          totalPages={pageCount}
          onPageSelect={(page) => handleTabClick('illustrations', { preventDefault: () => { } } as any)}
          disabled={!showIllustrationsTab} // Inactive for trial
        />
      )}
    </>
  )
}
