'use client'

import { useRef, useEffect } from 'react'
import { Page } from '@/types/page'
import { SharedIllustrationBoard } from './SharedIllustrationBoard'
import { Loader2 } from 'lucide-react'

// --------------------------------------------------------------------------
// UNIFIED FEED PROPS (Hybrid of Admin + Customer needs)
// --------------------------------------------------------------------------
interface UnifiedIllustrationFeedProps {
    mode: 'admin' | 'customer'
    pages: Page[]
    activePageId?: string | null
    onPageChange?: (pageId: string) => void

    // CUSTOMER SPECIFIC
    illustrationStatus?: string
    onSaveFeedback?: (pageId: string, notes: string) => Promise<void>

    // ADMIN SPECIFIC
    isAnalyzing?: boolean
    projectId?: string // Needed for reviews fetch inside Board? actually Board handles reviews internally via props or fetch?
    // Wait, SharedBoard doesn't fetch reviews. It receives `page`. `page` has `feedback_notes`.
    // BUT the History Dialog needs to fetch? Or it uses `page.feedback_history`.
    // IllustrationsTabContent was fetching reviews: `const { data } = await supabase.from('illustration_reviews')...`
    // We should probably move that fetch logic OR pass reviews down.
    // For now, let's assume `page` object has recent data. 

    // ADMIN STATE/HANDLERS
    loadingState?: { sketch: boolean; illustration: boolean }
    onGenerate?: (page: Page) => void
    onRegenerate?: (page: Page, prompt: string) => void
    onUpload?: (page: Page, type: 'sketch' | 'illustration', file: File) => void

    // Wizard State (Admin)
    aspectRatio?: string
    setAspectRatio?: (val: string) => void
    textIntegration?: string
    setTextIntegration?: (val: string) => void

    // UI Feedback
    generatingPageId?: string | null
    loadingStateMap?: { [key: string]: { sketch: boolean; illustration: boolean } }
}

export function UnifiedIllustrationFeed({
    mode,
    pages,
    activePageId,
    onPageChange,
    illustrationStatus = 'draft',
    onSaveFeedback,
    isAnalyzing = false,
    loadingState,
    onGenerate,
    onRegenerate,
    onUpload,
    aspectRatio,
    setAspectRatio,
    textIntegration,
    setTextIntegration,
    generatingPageId,
    loadingStateMap
}: UnifiedIllustrationFeedProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const isScrollingRef = useRef(false)
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // --------------------------------------------------------------------------
    // SCROLL SPY (Intersection Observer)
    // --------------------------------------------------------------------------
    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container || !pages.length) return

        const observer = new IntersectionObserver((entries) => {
            // Find the entry that is most visible
            const visibleEntry = entries.find(entry => entry.isIntersecting && entry.intersectionRatio > 0.5)

            if (visibleEntry) {
                const pageId = visibleEntry.target.getAttribute('data-page-id')
                if (pageId && pageId !== activePageId && !isScrollingRef.current) {
                    onPageChange?.(pageId)
                }
            }
        }, {
            root: container,
            threshold: 0.6 // Trigger when 60% visible
        })

        pages.forEach(page => {
            const el = document.getElementById(`page-${page.id}`)
            if (el) observer.observe(el)
        })

        return () => observer.disconnect()
    }, [pages, activePageId, onPageChange])

    // --------------------------------------------------------------------------
    // PROGRAMMATIC SCROLL
    // --------------------------------------------------------------------------
    useEffect(() => {
        if (activePageId && !isScrollingRef.current) {
            const el = document.getElementById(`page-${activePageId}`)
            if (el && scrollContainerRef.current) {
                isScrollingRef.current = true
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })

                if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
                scrollTimeoutRef.current = setTimeout(() => {
                    isScrollingRef.current = false
                }, 1000)
            }
        }
    }, [activePageId])


    // --------------------------------------------------------------------------
    // LOADING STATES (Empty Analysis)
    // --------------------------------------------------------------------------
    if (isAnalyzing && (!pages || pages.length === 0)) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-6 h-full min-h-[500px]">
                <div className="relative">
                    <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping opacity-75"></div>
                    <div className="relative bg-purple-600 rounded-full p-4">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                </div>
                <h2 className="text-xl font-semibold text-slate-900">AI Director Analysis</h2>
                <p className="text-slate-500">Reading your story and planning illustrations...</p>
            </div>
        )
    }

    // --------------------------------------------------------------------------
    // RENDER FEED
    // Calculate Height: 
    // Admin: 100vh - 140px (Header + Tabs)
    // Customer: 100vh - 72px (Header)
    // --------------------------------------------------------------------------
    // Unified Height Calculation: Both Admin and Customer headers are physically 70px tall.
    // Both views now use full-screen layout for illustrations.
    const heightClass = 'h-[calc(100vh-70px)]'

    const isProductionUnlocked = ['illustration_approved', 'illustration_production', 'completed'].includes(illustrationStatus)
    const visiblePages = pages.filter(p => isProductionUnlocked || p.page_number === 1)

    return (
        <div
            ref={scrollContainerRef}
            className={`${heightClass} w-full overflow-y-auto snap-y snap-mandatory scroll-smooth pb-20`}
        >
            {visiblePages.map(page => (
                <div key={page.id} className="min-h-full h-auto snap-start w-full">
                    <SharedIllustrationBoard
                        mode={mode}
                        page={page}
                        illustrationStatus={illustrationStatus}

                        // Handlers
                        onSaveFeedback={onSaveFeedback ? (notes) => onSaveFeedback(page.id, notes) : undefined}
                        onGenerate={onGenerate ? () => onGenerate(page) : undefined}
                        onRegenerate={onRegenerate ? (prompt) => onRegenerate(page, prompt) : undefined}
                        onUpload={onUpload ? (type, file) => onUpload(page, type, file) : undefined}

                        // State Config
                        isGenerating={page.id === generatingPageId}
                        loadingState={loadingStateMap?.[page.id] || { sketch: false, illustration: false }}

                        // Wizard
                        aspectRatio={aspectRatio}
                        setAspectRatio={setAspectRatio}
                        textIntegration={textIntegration}
                        setTextIntegration={setTextIntegration}
                    />
                </div>
            ))}
            {/* Spacer for bottom scrolling */}
            {pages.length > 1 && <div className="min-h-[100px] w-full snap-center" />}
        </div>
    )
}
