'use client'

import { Page } from '@/types/page'

interface UnifiedIllustrationSidebarProps {
    pages: Page[]
    activePageId: string | null
    onPageClick: (pageId: string) => void
    illustrationStatus?: string
    mode: 'admin' | 'customer'
    disabled?: boolean
}

export function UnifiedIllustrationSidebar({
    pages,
    activePageId,
    onPageClick,
    illustrationStatus = 'draft',
    mode,
    disabled = false
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
        <div className="hidden lg:block fixed left-0 top-[70px] h-[calc(100vh-70px)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40 pb-20">
            <div className="p-2 space-y-1">
                {/* Header or Spacing? Customer had p-4 wrapper. Admin had p-2. Let's start with a small p-2 padding for the list */}

                {pages.filter(p => isProductionUnlocked || p.page_number === 1).map((page) => {
                    const isActive = activePageId === page.id

                    // If we are filtering, we don't strictly need the lock visual anymore IF they are hidden.
                    // But if we ever allow them to be seen (e.g. Admin override?), we keep lock logic.
                    // Since we are filtering them out locally, they simply won't exist in the DOM.
                    const isLocked = false // They are hidden now.

                    return (
                        <button
                            key={page.id}
                            onClick={() => onPageClick(page.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-all flex items-center justify-between group ${isActive
                                ? 'bg-purple-50 text-purple-700 font-medium border-l-4 border-purple-600' // Customer Style
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'
                                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="flex items-center gap-2">
                                Page {page.page_number}
                                {page.page_number === 1 && !isProductionUnlocked && (
                                    <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Trial</span>
                                )}
                            </span>

                            {/* Status Indicators */}
                            <span className={`w-2 h-2 rounded-full ${page.illustration_url ? 'bg-green-400' : 'bg-transparent'
                                }`} title={page.illustration_url ? "Completed" : "Pending"}></span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
