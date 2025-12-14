import * as React from "react"
import { cn } from "@/lib/utils"

interface MobilePageNavigatorProps {
    currentPage: number
    totalPages: number
    onPageSelect: (pageNumber: number) => void
    disabled?: boolean
    className?: string
}

export function MobilePageNavigator({
    currentPage,
    totalPages,
    onPageSelect,
    disabled = false,
    className,
}: MobilePageNavigatorProps) {
    const scrollRef = React.useRef<HTMLDivElement>(null)

    // Scroll active page into view on mount and change
    React.useEffect(() => {
        if (scrollRef.current && currentPage) {
            const activeElement = scrollRef.current.querySelector(`[data-page="${currentPage}"]`) as HTMLElement
            if (activeElement) {
                const container = scrollRef.current
                const scrollLeft = activeElement.offsetLeft - (container.clientWidth / 2) + (activeElement.clientWidth / 2)
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
            }
        }
    }, [currentPage])

    // Generate page numbers array [1, 2, 3, ...]
    const pages = React.useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages])

    if (totalPages <= 0) return null

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-slate-200 h-16 flex items-center shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] md:hidden transition-transform duration-300",
                disabled && "opacity-80 grayscale-[0.5] pointer-events-none",
                className
            )}
        >
            <div
                ref={scrollRef}
                className="flex items-center gap-3 overflow-x-auto px-6 w-full h-full no-scrollbar overscroll-x-contain snap-x cursor-grab active:cursor-grabbing"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {pages.map((pageNum) => {
                    const isActive = pageNum === currentPage
                    const isClickable = !disabled

                    return (
                        <button
                            key={pageNum}
                            data-page={pageNum}
                            onClick={() => isClickable && onPageSelect(pageNum)}
                            disabled={!isClickable}
                            className={cn(
                                "snap-center shrink-0 flex items-center justify-center rounded-full transition-all duration-300 font-bold",
                                // Size
                                isActive ? "w-10 h-10 text-base shadow-lg scale-110" : "w-8 h-8 text-sm opacity-60 hover:opacity-100",
                                // Colors
                                isActive
                                    ? "bg-blue-600 text-white shadow-blue-200"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                // Disabled
                                !isClickable && "cursor-not-allowed"
                            )}
                        >
                            {pageNum}
                        </button>
                    )
                })}

                {/* Spacer for right padding */}
                <div className="shrink-0 w-3" />
            </div>

            {/* Fade overlay for scroll indication */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        </div>
    )
}
