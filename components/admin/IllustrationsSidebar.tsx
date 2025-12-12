'use client'

import { Download } from 'lucide-react'
import { toast } from 'sonner'

interface Page {
    id: string
    page_number: number
    illustration_url?: string | null
}

interface IllustrationsSidebarProps {
    pages: Page[]
    activePageId: string | null
    onPageClick: (pageId: string) => void
}

export function IllustrationsSidebar({
    pages,
    activePageId,
    onPageClick,
}: IllustrationsSidebarProps) {
    const handleDownloadClick = () => {
        toast.info('Feature coming soon: Download all illustrations')
    }

    return (
        <div className="hidden md:block fixed left-0 top-[64px] h-[calc(100vh-4rem)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">
                        Illustrations
                    </h3>
                    <button
                        onClick={handleDownloadClick}
                        className="text-gray-400 hover:text-purple-600 transition-colors"
                        title="Download All"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
                <nav className="space-y-1">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            onClick={() => onPageClick(page.id)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex justify-between items-center ${activePageId === page.id
                                ? 'bg-purple-50 text-purple-700 font-medium border-l-4 border-purple-600'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            <span>Page {page.page_number}</span>
                            {page.illustration_url && (
                                <span className="w-2 h-2 rounded-full bg-green-400" title="Completed"></span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    )
}
