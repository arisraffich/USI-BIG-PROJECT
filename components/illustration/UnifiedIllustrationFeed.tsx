'use client'

import { useRef, useEffect } from 'react'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { SharedIllustrationBoard, SceneCharacter } from './SharedIllustrationBoard'
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
    projectId?: string
    characters?: Character[] // All project characters for character control

    // ADMIN STATE/HANDLERS
    loadingState?: { sketch: boolean; illustration: boolean }
    onGenerate?: (page: Page, referenceImageUrl?: string) => void
    onRegenerate?: (page: Page, prompt: string, referenceImages?: string[], referenceImageUrl?: string, sceneCharacters?: SceneCharacter[]) => void
    onUpload?: (page: Page, type: 'sketch' | 'illustration', file: File) => void

    // Wizard State (Admin)
    aspectRatio?: string
    setAspectRatio?: (val: string) => void
    textIntegration?: string
    setTextIntegration?: (val: string) => void

    // UI Feedback
    generatingPageIds?: Set<string>
    loadingStateMap?: { [key: string]: { sketch: boolean; illustration: boolean } }
    
    // Batch Generation
    allPages?: Page[]
    onGenerateAllRemaining?: (startingPage: Page) => void
    onCancelBatch?: () => void
    batchState?: {
        isRunning: boolean
        total: number
        completed: number
        failed: number
        currentPageIds: Set<string>
    }
    
    // Error State
    pageErrors?: { [pageId: string]: { message: string; technicalDetails: string } }
}

export function UnifiedIllustrationFeed({
    mode,
    pages,
    activePageId,
    onPageChange,
    illustrationStatus = 'draft',
    onSaveFeedback,
    isAnalyzing = false,
    projectId,
    characters = [],
    loadingState,
    onGenerate,
    onRegenerate,
    onUpload,
    aspectRatio,
    setAspectRatio,
    textIntegration,
    setTextIntegration,
    generatingPageIds = new Set(),
    loadingStateMap,
    allPages,
    onGenerateAllRemaining,
    onCancelBatch,
    batchState,
    pageErrors
}: UnifiedIllustrationFeedProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const isScrollingRef = useRef(false)
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastSpyPageIdRef = useRef<string | null>(null)
    const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map())

    // --------------------------------------------------------------------------
    // SCROLL SPY (Intersection Observer) - Logic from ManuscriptEditor
    // --------------------------------------------------------------------------
    useEffect(() => {
        // NOTE: Switched to root: null (viewport) to match ManuscriptEditor and ensuring detection works regardless of container quirks.
        const container = scrollContainerRef.current

        if (!pages || pages.length === 0) return // Removed container check for return since we use viewport

        // NOTE: Switched to root: null (viewport).
        // Debugging: rootMargin 0px, detailed logs.
        // Match ManuscriptEditor's robust settings
        const observerOptions = {
            root: null, // viewport
            // Trigger when page crosses top (with some buffer) or leaves bottom
            // -100px from top means we start 'seeing' it when it's near the top
            // -50% from bottom means we stop 'seeing' it when it's half scrolled out? 
            // Actually ManuscriptEditor uses: '-100px 0px -50% 0px'
            rootMargin: '-100px 0px -50% 0px',
            threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
        }

        const pageVisibility = new Map<string, number>()

        const observerCallback = (entries: IntersectionObserverEntry[]) => {
            // Update our map of visible ratios
            entries.forEach((entry) => {
                const pageId = entry.target.getAttribute('data-page-id')
                if (pageId) {
                    if (entry.isIntersecting) {
                        pageVisibility.set(pageId, entry.intersectionRatio)
                    } else {
                        pageVisibility.delete(pageId)
                    }
                }
            })

            // Find the best page
            let bestPage: { id: string; ratio: number } | null = null

            if (pageVisibility.size > 0) {
                let maxRatio = -1
                for (const [id, ratio] of pageVisibility.entries()) {
                    if (ratio > maxRatio) {
                        maxRatio = ratio
                        bestPage = { id, ratio }
                    }
                }
            }

            if (bestPage) {
                const pageId = bestPage.id
                // Use ref to prevent circular updates if we just scrolled programmatically
                if (pageId !== activePageId && !isScrollingRef.current) {
                    lastSpyPageIdRef.current = pageId
                    onPageChange?.(pageId)
                }
            }
        }

        const observer = new IntersectionObserver(observerCallback, observerOptions)

        // Use requestAnimationFrame to ensure DOM is ready (Critical for React rendering)
        const rafId = requestAnimationFrame(() => {
            pages.forEach(page => {
                const el = pageRefs.current.get(page.id)
                // Also check if data-page-id matches just in case? No, ID relies on `page-{id}`
                if (el) observer.observe(el)
            })
        })

        return () => {
            cancelAnimationFrame(rafId)
            observer.disconnect()
            pageVisibility.clear()
        }
    }, [pages, activePageId, onPageChange])

    // --------------------------------------------------------------------------
    // PROGRAMMATIC SCROLL
    // --------------------------------------------------------------------------
    useEffect(() => {
        if (activePageId && !isScrollingRef.current && activePageId !== lastSpyPageIdRef.current) {
            const el = pageRefs.current.get(activePageId)
            if (el && scrollContainerRef.current) {
                isScrollingRef.current = true
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })

                if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
                scrollTimeoutRef.current = setTimeout(() => {
                    isScrollingRef.current = false
                }, 1000)
            }
        } else if (activePageId === lastSpyPageIdRef.current) {
            // Reset the spy ref so that if we navigate away and back to the same page manually (e.g. via button), it still works.
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

    const visiblePages = pages.filter(p => {
        if (mode === 'admin') return true
        return p.page_number === 1 || !!p.customer_illustration_url || !!p.customer_sketch_url
    })

    return (
        <div
            ref={scrollContainerRef}
            className={`${heightClass} w-full overflow-y-auto md:snap-y md:snap-mandatory scroll-smooth pb-20`}
        >
            {visiblePages.map(page => {
                // CALCULATE ILLUSTRATED PAGES FOR ENVIRONMENT REFERENCE
                // Any page with an illustration EXCEPT the current page
                const illustratedPages = pages.filter(p =>
                    p.id !== page.id &&
                    (p.illustration_url)
                ).sort((a, b) => a.page_number - b.page_number)

                return (
                    <div
                        key={page.id}
                        ref={(el) => {
                            if (el) pageRefs.current.set(page.id, el)
                            else pageRefs.current.delete(page.id)
                        }}
                        id={`page-${page.id}`}
                        data-page-id={page.id}
                        className="min-h-full h-auto snap-start w-full"
                    >
                        <SharedIllustrationBoard
                            mode={mode}
                            page={page}
                            projectId={projectId}
                            illustrationStatus={illustrationStatus as any}

                            // Pass candidates for environment reference
                            illustratedPages={illustratedPages}
                            characters={characters}

                            // Handlers
                            onSaveFeedback={async (notes) => {
                                if (onSaveFeedback) await onSaveFeedback(page.id, notes)
                            }}
                            onGenerate={onGenerate ? ((refUrl?: string) => onGenerate(page, refUrl)) : undefined}
                            onRegenerate={onRegenerate ? (prompt, referenceImages, referenceImageUrl, sceneCharacters) => onRegenerate(page, prompt, referenceImages, referenceImageUrl, sceneCharacters) : undefined}
                            onUpload={async (type, file) => {
                                if (onUpload) onUpload(page, type, file)
                            }}

                            // State Config
                            isGenerating={generatingPageIds.has(page.id)}
                            loadingState={loadingStateMap?.[page.id] || { sketch: false, illustration: false }}

                            // Wizard
                            aspectRatio={aspectRatio}
                            setAspectRatio={setAspectRatio}
                            textIntegration={textIntegration}
                            setTextIntegration={setTextIntegration}
                            
                            // Batch Generation
                            allPages={allPages}
                            onGenerateAllRemaining={onGenerateAllRemaining}
                            onCancelBatch={onCancelBatch}
                            batchState={batchState}
                            
                            // Error State
                            generationError={pageErrors?.[page.id]}
                        />
                    </div>
                )
            })}
            {/* Spacer for bottom scrolling */}
            {pages.length > 1 && <div className="min-h-[100px] w-full snap-center" />}
        </div>
    )
}
