'use client'

import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Page } from '@/types/page'
import { Badge } from '@/components/ui/badge'

interface CustomerIllustrationSidebarProps {
    pages: Page[]
    activePageId: string | null
    onPageClick: (pageId: string) => void
    disabled?: boolean
}

export function CustomerIllustrationSidebar({
    pages,
    activePageId,
    onPageClick,
    disabled
}: CustomerIllustrationSidebarProps) {

    return (
        <div className="hidden lg:block fixed left-0 top-[72px] h-[calc(100vh-72px)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40 pb-20">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">
                        Illustrations
                    </h3>
                </div>
                <nav className="space-y-1">
                    {pages.map((page) => {
                        const isActive = activePageId === page.id
                        // Determine status badge (assuming Page 1 is always 'Trial' for now)
                        const isTrial = page.page_number === 1

                        return (
                            <button
                                key={page.id}
                                onClick={() => !disabled && onPageClick(page.id)}
                                disabled={disabled}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all flex items-center justify-between group ${isActive
                                    ? 'bg-purple-50 text-purple-700 font-medium border-l-4 border-purple-600'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'
                                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span>Page {page.page_number}</span>
                                {isTrial && (
                                    <span className="w-2 h-2 rounded-full bg-green-400" title="Active"></span>
                                )}
                            </button>
                        )
                    })}
                </nav>
            </div>
        </div>
    )
}
