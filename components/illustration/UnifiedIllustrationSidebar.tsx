'use client'

import { Page } from '@/types/page'

interface UnifiedIllustrationSidebarProps {
    pages: Page[]
    activePageId: string | null
    onPageClick: (pageId: string) => void
    illustrationStatus?: string
    mode: 'admin' | 'customer'
    disabled?: boolean
    failedPageIds?: string[]
}

export function UnifiedIllustrationSidebar({
    pages,
    activePageId,
    onPageClick,
    illustrationStatus = 'draft',
    mode,
    disabled = false,
    failedPageIds = []
}: UnifiedIllustrationSidebarProps) {
    // Locking logic: Pages 2+ are locked until status suggests approval
    // CUSTOMER: Lock until 'illustration_approved' etc.
    // ADMIN: Should admin be locked? Usually no, or yes? 
    // Existing Admin Sidebar code had: `const isLocked = page.page_number > 1 && !isProductionUnlocked`
    // So YES, Admin was also locking pages visually in the sidebar? 
    // Actually Admin sidebar logic: `const isLocked = page.page_number > 1 && !isProductionUnlocked`
    // Wait, does Admin really lock page 2 if page 1 is not done? Probably yes for flow.
    // Let's keep the logic consistent.

    // Logic from previous files:
    const isProductionUnlocked = ['illustration_approved', 'illustration_production', 'completed'].includes(illustrationStatus)

    // Admin might want to override locks? For now, we stick to the Unified Logic requested.
    // If the user said "Identical", then logic is identical.

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden lg:block fixed left-0 top-[70px] h-[calc(100vh-70px)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40 pb-20">
                <div className="p-2 space-y-1">
                    {/* Header or Spacing? Customer had p-4 wrapper. Admin had p-2. Let's start with a small p-2 padding for the list */}

                    {pages.filter(p => {
                        if (mode === 'admin') return true
                        return p.page_number === 1 || !!p.customer_illustration_url || !!p.customer_sketch_url
                    }).map((page) => {
                        const isActive = activePageId === page.id
                        const isLocked = !isProductionUnlocked && page.page_number > 1

                        return (
                            <button
                                key={page.id}
                                onClick={() => !isLocked && onPageClick(page.id)}
                                disabled={disabled || isLocked}
                                className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-all flex items-center justify-between group ${isActive
                                    ? 'bg-purple-50 text-purple-700 font-medium border-l-4 border-purple-600' // Customer Style
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'
                                    } ${(disabled || isLocked) ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
                            >
                                <span className="flex items-center gap-2">
                                    Page {page.page_number}
                                    {/* Error indicator */}
                                    {failedPageIds.includes(page.id) && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Generation failed" />
                                    )}
                                </span>

                                {/* Status Indicators */}
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
            </div >

            {/* Mobile Bottom Navigation - Individual Glass Buttons */}
            {/* Mobile Bottom Navigation - Individual Glass Buttons */}
            <div className="block lg:hidden fixed bottom-6 left-0 right-0 z-50 pointer-events-none">
                <div className="flex items-center gap-2 overflow-x-auto pointer-events-auto px-4 py-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {pages.filter(p => {
                        if (mode === 'admin') return true
                        return p.page_number === 1 || !!p.customer_illustration_url || !!p.customer_sketch_url
                    }).map((page) => {
                        const isActive = activePageId === page.id
                        const isLocked = !isProductionUnlocked && page.page_number > 1

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
                                {/* Error dot indicator */}
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
