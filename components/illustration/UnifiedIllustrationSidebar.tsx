'use client'

import { Page } from '@/types/page'
import { ProjectStatus } from '@/types/project'

interface UnifiedIllustrationSidebarProps {
    pages: Page[]
    activePageId: string | null
    onPageClick: (pageId: string) => void
    projectStatus: ProjectStatus
    mode: 'admin' | 'customer'
    disabled?: boolean
    failedPageIds?: string[]
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
    illustrationSendCount = 0
}: UnifiedIllustrationSidebarProps) {
    // ============================================================
    // LOCKING LOGIC (Pages 2+ visibility/access)
    // ============================================================
    // ADMIN: 
    //   - Before trial_approved: Locked (only page 1, generating trial)
    //   - After trial_approved: Unlocked (can generate all pages)
    //
    // CUSTOMER:
    //   - Before first sketches send: Locked (only sees page 1 trial)
    //   - After sketches_review (sendCount > 1): Unlocked (sees all pages)
    // ============================================================
    
    const isAdminUnlocked = [
        'trial_approved',
        'illustrations_generating', 
        'sketches_review', 
        'sketches_revision',
        'illustration_approved',
        'completed',
        // Legacy: when sendCount > 1, admin already sent all pages
        ...(illustrationSendCount > 1 ? ['illustration_review', 'illustration_revision_needed'] : [])
    ].includes(projectStatus)
    
    const isCustomerUnlocked = [
        'sketches_review',
        'sketches_revision', 
        'illustration_approved',
        'completed',
        // Legacy: when sendCount > 1, customer received all sketches
        ...(illustrationSendCount > 1 ? ['illustration_review', 'illustration_revision_needed'] : [])
    ].includes(projectStatus)
    
    // Determine if pages 2+ are locked based on mode
    const isPagesUnlocked = mode === 'admin' ? isAdminUnlocked : isCustomerUnlocked

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden lg:block fixed left-0 top-[70px] h-[calc(100vh-70px)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40 pb-20">
                <div className="p-2 space-y-1">
                    {pages.filter(p => {
                        // Admin always sees all pages in sidebar
                        if (mode === 'admin') return true
                        // Customer: Only show pages that have been sent to them
                        if (p.page_number === 1) return true
                        if (isCustomerUnlocked) return true
                        return !!p.customer_illustration_url || !!p.customer_sketch_url
                    }).map((page) => {
                        const isActive = activePageId === page.id
                        // Page 1 is never locked
                        // Pages 2+ are locked until unlocked condition is met
                        const isLocked = page.page_number > 1 && !isPagesUnlocked

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
                                    Page {page.page_number}
                                    {failedPageIds.includes(page.id) && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Generation failed" />
                                    )}
                                </span>

                                <span className={`w-2 h-2 rounded-full ${
                                    failedPageIds.includes(page.id) 
                                        ? 'bg-red-500' 
                                        : page.illustration_url 
                                            ? 'bg-green-400' 
                                            : 'bg-transparent'
                                    }`} title={failedPageIds.includes(page.id) ? "Failed" : page.illustration_url ? "Completed" : "Pending"}></span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="block lg:hidden fixed bottom-6 left-0 right-0 z-50 pointer-events-none">
                <div className="flex items-center gap-2 overflow-x-auto pointer-events-auto px-4 py-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {pages.filter(p => {
                        if (mode === 'admin') return true
                        if (p.page_number === 1) return true
                        if (isCustomerUnlocked) return true
                        return !!p.customer_illustration_url || !!p.customer_sketch_url
                    }).map((page) => {
                        const isActive = activePageId === page.id
                        const isLocked = page.page_number > 1 && !isPagesUnlocked

                        return (
                            <div key={page.id} className="relative flex-shrink-0">
                                <button
                                    onClick={() => !isLocked && onPageClick(page.id)}
                                    disabled={disabled || isLocked}
                                    className={`w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold transition-all shadow-sm ${isActive
                                        ? 'bg-purple-600 text-white shadow-lg scale-110 border border-purple-500'
                                        : failedPageIds.includes(page.id)
                                            ? 'bg-red-100 border border-red-400 text-red-700'
                                            : 'bg-white/30 backdrop-blur-md border border-white/20 text-slate-900 ring-1 ring-white/30 hover:bg-white/50'
                                        } ${(disabled || isLocked) ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                    {page.page_number}
                                </button>
                                {failedPageIds.includes(page.id) && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-white animate-pulse" />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </>
    )
}
