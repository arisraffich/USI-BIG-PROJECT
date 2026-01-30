'use client'

import { Page } from '@/types/page'
import { ProjectStatus } from '@/types/project'
import { useIllustrationLock } from '@/hooks/use-illustration-lock'
import { MessageSquare, CheckCircle2 } from 'lucide-react'

interface UnifiedIllustrationSidebarProps {
    pages: Page[]
    activePageId: string | null
    onPageClick: (pageId: string) => void
    projectStatus: ProjectStatus
    mode: 'admin' | 'customer'
    disabled?: boolean
    failedPageIds?: string[]
    generatingPageIds?: string[]
    illustrationSendCount?: number
}

export function UnifiedIllustrationSidebar({
    pages,
    activePageId,
    onPageClick,
    projectStatus,
    mode,
    disabled = false,
    failedPageIds = [],
    generatingPageIds = [],
    illustrationSendCount = 0
}: UnifiedIllustrationSidebarProps) {
    // Centralized lock logic from useIllustrationLock hook
    const { isPagesUnlocked, isPageLocked, filterVisiblePages } = useIllustrationLock({
        projectStatus,
        mode,
        pages,
    })

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden lg:block fixed left-0 top-[70px] h-[calc(100vh-70px)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40 pb-20">
                <div className="p-2 space-y-1">
                    {filterVisiblePages(pages).map((page) => {
                        const isActive = activePageId === page.id
                        const isLocked = isPageLocked(page.page_number)

                        return (
                            <button
                                key={page.id}
                                onClick={() => !isLocked && onPageClick(page.id)}
                                disabled={disabled || isLocked}
                                className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-all flex items-center justify-between group ${isActive
                                    ? 'bg-purple-50 text-purple-700 font-medium border-l-4 border-purple-600'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'
                                    } ${(disabled || isLocked) ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
                            >
                                <span className="flex items-center gap-2">
                                    {/* Feedback indicator - Admin only */}
                                    {mode === 'admin' && page.feedback_notes && !page.is_resolved && (
                                        <span title="Has unresolved feedback">
                                            <MessageSquare className="w-4 h-4 text-amber-500" />
                                        </span>
                                    )}
                                    {mode === 'admin' && page.feedback_notes && page.is_resolved && (
                                        <span title="Feedback resolved">
                                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                                        </span>
                                    )}
                                    Page {page.page_number}
                                    {/* Spread indicator */}
                                    {page.is_spread && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded" title="Double-page spread">
                                            Spread
                                        </span>
                                    )}
                                    {failedPageIds.includes(page.id) && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Generation failed" />
                                    )}
                                </span>

                                <span className={`w-2 h-2 rounded-full ${
                                    failedPageIds.includes(page.id) 
                                        ? 'bg-red-500' 
                                        : generatingPageIds.includes(page.id)
                                            ? 'bg-orange-400 animate-pulse'
                                            : page.illustration_url 
                                                ? 'bg-green-400' 
                                                : 'bg-gray-300'
                                    }`} title={failedPageIds.includes(page.id) ? "Failed" : generatingPageIds.includes(page.id) ? "Generating..." : page.illustration_url ? "Completed" : "Pending"}></span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="block lg:hidden fixed bottom-6 left-0 right-0 z-50 pointer-events-none">
                <div className="flex items-center gap-2 overflow-x-auto pointer-events-auto px-4 py-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {filterVisiblePages(pages).map((page) => {
                        const isActive = activePageId === page.id
                        const isLocked = isPageLocked(page.page_number)

                        return (
                            <div key={page.id} className="relative flex-shrink-0">
                                <button
                                    onClick={() => !isLocked && onPageClick(page.id)}
                                    disabled={disabled || isLocked}
                                    className={`w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold transition-all shadow-sm ${isActive
                                        ? 'bg-purple-600 text-white shadow-lg scale-110 border border-purple-500'
                                        : failedPageIds.includes(page.id)
                                            ? 'bg-red-100 border border-red-400 text-red-700'
                                            : generatingPageIds.includes(page.id)
                                                ? 'bg-orange-100 border border-orange-400 text-orange-700 animate-pulse'
                                                : 'bg-white/30 backdrop-blur-md border border-white/20 text-slate-900 ring-1 ring-white/30 hover:bg-white/50'
                                        } ${(disabled || isLocked) ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                    {page.page_number}
                                </button>
                                {failedPageIds.includes(page.id) && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-white animate-pulse" />
                                )}
                                {/* Spread indicator - mobile (bottom-right corner) */}
                                {page.is_spread && !failedPageIds.includes(page.id) && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border border-white text-[6px] font-bold text-white flex items-center justify-center" title="Spread">
                                        2
                                    </span>
                                )}
                                {/* Feedback indicator - Admin only (mobile) */}
                                {mode === 'admin' && page.feedback_notes && !page.is_resolved && (
                                    <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-amber-400 border border-white flex items-center justify-center">
                                        <MessageSquare className="w-2 h-2 text-white" />
                                    </span>
                                )}
                                {mode === 'admin' && page.feedback_notes && page.is_resolved && (
                                    <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-green-500 border border-white flex items-center justify-center">
                                        <CheckCircle2 className="w-2 h-2 text-white" />
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </>
    )
}
