'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { BookImage } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CoverBoard } from '@/components/cover/CoverBoard'
import { Cover, CoverCandidateSet } from '@/types/cover'
import { Page } from '@/types/page'

interface CoverTabContentProps {
    projectId: string
    /** Pages for the project — needed by the front regen modal's reference-picker. */
    pages: Page[]
    /**
     * Initial cover loaded by the parent (may be null). CoverTabContent treats
     * this as a hydration seed and keeps its own state for subsequent updates.
     */
    initialCover: Cover | null
    /**
     * Parent-owned setter. Fired whenever the cover state changes here so the
     * parent (ProjectTabsContent) can keep `hasCover` in sync with illustrations.
     */
    onCoverChange?: (cover: Cover | null) => void
}

/**
 * Cover tab shell.
 *   - Empty state: tells admin to click "Create Cover" on an illustration.
 *   - Filled state: renders CoverBoard (dual pane + regen + comparison + delete).
 */
export function CoverTabContent({ projectId: _projectId, pages, initialCover, onCoverChange }: CoverTabContentProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()

    const [cover, setCover] = useState<Cover | null>(initialCover)
    const [pendingCandidates, setPendingCandidates] = useState<CoverCandidateSet | null>(null)

    useEffect(() => {
        setCover(initialCover)
    }, [initialCover])

    useEffect(() => {
        onCoverChange?.(cover)
    }, [cover, onCoverChange])

    useEffect(() => {
        if (!cover || typeof window === 'undefined') {
            setPendingCandidates(null)
            return
        }
        const key = `cover-candidates-${cover.id}`
        const raw = window.sessionStorage.getItem(key)
        if (!raw) {
            setPendingCandidates(null)
            return
        }
        try {
            setPendingCandidates(JSON.parse(raw) as CoverCandidateSet)
        } catch {
            window.sessionStorage.removeItem(key)
            setPendingCandidates(null)
        }
    }, [cover?.id])

    const handleCoverUpdated = useCallback((nextCover: Cover) => {
        setCover(nextCover)
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(`cover-candidates-${nextCover.id}`)
        }
        setPendingCandidates(null)
    }, [])

    const goToIllustrations = useCallback(() => {
        const params = new URLSearchParams(searchParams?.toString() || '')
        params.set('tab', 'illustrations')
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [router, searchParams, pathname])

    // --- Empty state -----------------------------------------------------
    if (!cover) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-purple-50 flex items-center justify-center mb-5">
                    <BookImage className="w-10 h-10 text-purple-500" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800 mb-2">No cover yet</h2>
                <p className="text-sm text-slate-500 max-w-md mb-6">
                    To create your cover, go to the Illustrations tab and click <span className="font-medium text-slate-700">&ldquo;Create Cover&rdquo;</span> on the illustration you want to use as the reference.
                </p>
                <Button
                    variant="outline"
                    onClick={goToIllustrations}
                    className="gap-2"
                >
                    Go to Illustrations
                </Button>
            </div>
        )
    }

    // --- Filled state ----------------------------------------------------
    return (
        <CoverBoard
            cover={cover}
            pages={pages}
            pendingCandidates={pendingCandidates}
            onCoverUpdated={handleCoverUpdated}
            onCandidatesCleared={() => setPendingCandidates(null)}
        />
    )
}
