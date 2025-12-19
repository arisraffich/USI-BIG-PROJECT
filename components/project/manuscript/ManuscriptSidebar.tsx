'use client'

import { Download } from 'lucide-react'
import { toast } from 'sonner'

interface Page {
  id: string
  page_number: number
}

interface ManuscriptSidebarProps {
  pages: Page[]
  activePageId: string | null
  onPageClick: (pageId: string) => void
}

export function ManuscriptSidebar({
  pages,
  activePageId,
  onPageClick,
}: ManuscriptSidebarProps) {
  const handleDownloadClick = () => {
    toast.info('Download feature coming soon!')
  }

  return (
    <div className="hidden md:block fixed left-0 top-[64px] h-[calc(100vh-4rem)] w-[250px] bg-white border-r border-gray-200 overflow-y-auto z-40">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Pages
          </h3>
          <button
            onClick={handleDownloadClick}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Download Manuscript"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        <nav className="space-y-1">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => onPageClick(page.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activePageId === page.id
                ? 'bg-blue-50 text-blue-700 font-medium border-l-4 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              Page {page.page_number}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}












