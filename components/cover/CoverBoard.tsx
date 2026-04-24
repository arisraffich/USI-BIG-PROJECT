'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { CoverSidePane } from '@/components/cover/CoverSidePane'
import { CoverFrontRegenModal } from '@/components/cover/CoverFrontRegenModal'
import { CoverBackRegenModal } from '@/components/cover/CoverBackRegenModal'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Cover, CoverCandidate, CoverCandidateSet } from '@/types/cover'
import { Page } from '@/types/page'

interface CoverBoardProps {
    cover: Cover
    pages: Page[]
    pendingCandidates?: CoverCandidateSet | null
    /** Parent owns the canonical cover state; board reports changes upward. */
    onCoverUpdated: (cover: Cover) => void
    onCandidatesCleared?: () => void
}

type Comparison = { oldUrl: string, newUrl: string }

type CoverLightbox = { side: 'front' | 'back', url: string }

/**
 * Dual-pane (back + front) cover display with per-side regenerate/compare.
 *
 * Delete + Download Both live in ProjectHeader (CoverHeaderActions) now — this
 * component is purely the visual board. On mobile, front stacks first since
 * it's the primary image; on desktop it stays on the right.
 */
export function CoverBoard({ cover, pages, pendingCandidates, onCoverUpdated, onCandidatesCleared }: CoverBoardProps) {
    const [isFrontRegenOpen, setIsFrontRegenOpen] = useState(false)
    const [isFrontRegenerating, setIsFrontRegenerating] = useState(false)
    const [frontComparison, setFrontComparison] = useState<Comparison | null>(null)

    const [isBackRegenOpen, setIsBackRegenOpen] = useState(false)
    const [isBackRegenerating, setIsBackRegenerating] = useState(false)
    const [backComparison, setBackComparison] = useState<Comparison | null>(null)
    const [isComparisonReverting, setIsComparisonReverting] = useState(false)
    const [isSelectingCandidate, setIsSelectingCandidate] = useState(false)

    // Fullscreen viewer: tracks which image URL is shown (may be a comparison candidate)
    // and which side it belongs to, for left/right navigation between front & back.
    const [lightbox, setLightbox] = useState<CoverLightbox | null>(null)

    // Disable the lightbox entirely on mobile (<768px, matches the board's stacking
    // breakpoint). Default to desktop so SSR render doesn't flash the wrong behavior.
    const [isDesktop, setIsDesktop] = useState(true)
    useEffect(() => {
        if (typeof window === 'undefined') return
        const mq = window.matchMedia('(min-width: 768px)')
        const update = () => setIsDesktop(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    const canNavigateLightbox = !!(cover.front_url && cover.back_url)

    const openLightbox = useCallback((side: 'front' | 'back', url: string) => {
        setLightbox({ side, url })
    }, [])

    // Passed into CoverSidePane only on desktop. When undefined, the pane skips
    // the zoom-in cursor/hover styling and becomes non-interactive for taps.
    const handleImageClick = isDesktop ? openLightbox : undefined

    /** Left side of the spread = back cover. */
    const goLightboxToBack = useCallback(() => {
        if (!lightbox || !cover.back_url || lightbox.side === 'back') return
        setLightbox({ side: 'back', url: cover.back_url })
    }, [lightbox, cover.back_url])

    /** Right side of the spread = front cover. */
    const goLightboxToFront = useCallback(() => {
        if (!lightbox || !cover.front_url || lightbox.side === 'front') return
        setLightbox({ side: 'front', url: cover.front_url })
    }, [lightbox, cover.front_url])

    useEffect(() => {
        if (!lightbox || !canNavigateLightbox) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                goLightboxToBack()
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                goLightboxToFront()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [lightbox, canNavigateLightbox, goLightboxToBack, goLightboxToFront])

    const lightboxLabel = useMemo(() => {
        if (!lightbox) return ''
        return lightbox.side === 'front' ? 'Front cover' : 'Back cover'
    }, [lightbox])

    // --- Front regen ------------------------------------------------------
    const handleFrontRegenStart = useCallback(() => {
        setIsFrontRegenerating(true)
        setFrontComparison(null)
    }, [])

    const handleFrontRegenSuccess = useCallback((payload: { cover: Cover, newUrl: string, oldUrl: string | null }) => {
        setIsFrontRegenerating(false)
        onCoverUpdated(payload.cover)
        if (payload.oldUrl) {
            setFrontComparison({ oldUrl: payload.oldUrl, newUrl: payload.newUrl })
            toast.info('Pick the version you want to keep — don\'t refresh until you do.')
        } else {
            // First front gen shouldn't happen from regen (empty cover would mean no front yet).
            // Fall back gracefully by just updating with no comparison.
            toast.success('Front cover updated')
        }
    }, [onCoverUpdated])

    const handleFrontRegenFailure = useCallback(() => {
        setIsFrontRegenerating(false)
    }, [])

    const handleFrontKeepNew = useCallback(() => {
        setFrontComparison(null)
        toast.success('New front cover saved')
    }, [])

    const handleFrontKeepOld = useCallback(async () => {
        if (!frontComparison) return
        try {
            const res = await fetch('/api/covers/revert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coverId: cover.id,
                    side: 'front',
                    url: frontComparison.oldUrl,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as { error?: string }))
                throw new Error(data?.error || 'Revert failed')
            }
            const data = await res.json() as { cover: Cover }
            onCoverUpdated(data.cover)
            setFrontComparison(null)
            toast.success('Reverted to previous front cover')
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Revert failed'
            toast.error(msg)
        }
    }, [frontComparison, cover.id, onCoverUpdated])


    const handleFrontRemaster = useCallback(async () => {
        if (!cover.front_url || isFrontRegenerating) return
        setIsFrontRegenerating(true)
        setFrontComparison(null)
        toast.info('Remastering front cover at max quality…')

        try {
            const res = await fetch('/api/covers/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coverId: cover.id,
                    side: 'front',
                    mode: 'remaster',
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as { error?: string }))
                throw new Error(data?.error || 'Remaster failed')
            }
            const data = await res.json() as { cover: Cover, newUrl: string, oldUrl: string | null }
            handleFrontRegenSuccess(data)
        } catch (err) {
            handleFrontRegenFailure()
            const msg = err instanceof Error ? err.message : 'Remaster failed'
            toast.error(msg)
        }
    }, [cover.id, cover.front_url, isFrontRegenerating, handleFrontRegenSuccess, handleFrontRegenFailure])

    // --- Back regen -------------------------------------------------------
    const handleBackRegenerate = useCallback(() => {
        if (!cover.front_url) {
            toast.error('Generate the front cover first — it\'s the reference for the back.')
            return
        }
        setIsBackRegenOpen(true)
    }, [cover.front_url])

    const handleBackRegenStart = useCallback(() => {
        setIsBackRegenerating(true)
        setBackComparison(null)
    }, [])

    const handleBackRegenSuccess = useCallback((payload: { cover: Cover, newUrl: string, oldUrl: string | null }) => {
        setIsBackRegenerating(false)
        onCoverUpdated(payload.cover)
        if (payload.oldUrl) {
            setBackComparison({ oldUrl: payload.oldUrl, newUrl: payload.newUrl })
            toast.info('Pick the version you want to keep — don\'t refresh until you do.')
        } else {
            // First back gen — no OLD to compare against; just accept the new one.
            toast.success('Back cover created')
        }
    }, [onCoverUpdated])

    const handleBackRegenFailure = useCallback(() => {
        setIsBackRegenerating(false)
    }, [])

    const handleBackKeepNew = useCallback(() => {
        setBackComparison(null)
        toast.success('New back cover saved')
    }, [])

    const handleBackKeepOld = useCallback(async () => {
        if (!backComparison) return
        try {
            const res = await fetch('/api/covers/revert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coverId: cover.id,
                    side: 'back',
                    url: backComparison.oldUrl,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as { error?: string }))
                throw new Error(data?.error || 'Revert failed')
            }
            const data = await res.json() as { cover: Cover }
            onCoverUpdated(data.cover)
            setBackComparison(null)
            toast.success('Reverted to previous back cover')
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Revert failed'
            toast.error(msg)
        }
    }, [backComparison, cover.id, onCoverUpdated])

    const activeComparison = useMemo(() => {
        if (frontComparison) {
            return {
                side: 'front' as const,
                oldUrl: frontComparison.oldUrl,
                newUrl: frontComparison.newUrl,
                onKeepNew: handleFrontKeepNew,
                onKeepOld: handleFrontKeepOld,
            }
        }
        if (backComparison) {
            return {
                side: 'back' as const,
                oldUrl: backComparison.oldUrl,
                newUrl: backComparison.newUrl,
                onKeepNew: handleBackKeepNew,
                onKeepOld: handleBackKeepOld,
            }
        }
        return null
    }, [frontComparison, backComparison, handleFrontKeepNew, handleFrontKeepOld, handleBackKeepNew, handleBackKeepOld])

    const handleComparisonKeepOld = useCallback(async () => {
        if (!activeComparison) return
        setIsComparisonReverting(true)
        try {
            await activeComparison.onKeepOld()
        } finally {
            setIsComparisonReverting(false)
        }
    }, [activeComparison])


    const candidateList = useMemo(() => {
        if (!pendingCandidates) return [] as CoverCandidate[]
        return [pendingCandidates.faithful, pendingCandidates.designed].filter((candidate): candidate is CoverCandidate => !!candidate)
    }, [pendingCandidates])

    const handleCandidateSelect = useCallback(async (candidate: CoverCandidate) => {
        if (isSelectingCandidate) return
        setIsSelectingCandidate(true)
        try {
            const rejectedStoragePaths = candidateList
                .filter(item => item.storagePath !== candidate.storagePath)
                .map(item => item.storagePath)

            const res = await fetch('/api/covers/select-candidate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coverId: cover.id,
                    selectedStoragePath: candidate.storagePath,
                    rejectedStoragePaths,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as { error?: string }))
                throw new Error(data?.error || 'Failed to save selected cover')
            }
            const data = await res.json() as { cover: Cover }
            onCoverUpdated(data.cover)
            onCandidatesCleared?.()
            toast.success(`${candidate.label} saved as front cover`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save selected cover'
            toast.error(msg)
        } finally {
            setIsSelectingCandidate(false)
        }
    }, [candidateList, cover.id, isSelectingCandidate, onCandidatesCleared, onCoverUpdated])

    return (
        <div className="px-4 md:px-6 pt-3 md:pt-4 pb-8 md:pb-4 md:h-[calc(100vh-170px)] md:min-h-[520px] md:flex md:items-center md:justify-center">
            {candidateList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-4 w-full md:w-auto md:h-full md:max-w-full">
                    {candidateList.map((candidate) => {
                        const isFaithful = candidate.kind === 'faithful'
                        return (
                            <div
                                key={candidate.kind}
                                className="flex flex-col items-center bg-white relative min-h-[420px] md:min-h-0 md:h-full md:w-auto md:aspect-[4/5] border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                            >
                                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
                                    <span className={`text-sm font-bold tracking-wider text-white uppercase px-3 py-1 rounded ${isFaithful ? 'bg-slate-700/80' : 'bg-green-600/90'}`}>
                                        {isFaithful ? 'FAITHFUL' : 'DESIGNED'}
                                    </span>
                                </div>
                                <div
                                    className={`relative w-full flex-1 min-h-[420px] md:min-h-0 transition-opacity ${handleImageClick ? 'cursor-pointer hover:opacity-95' : ''}`}
                                    onClick={handleImageClick ? () => handleImageClick('front', candidate.url) : undefined}
                                >
                                    <img
                                        src={candidate.url}
                                        alt={candidate.label}
                                        className="w-full h-full object-contain block"
                                    />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                                    <Button
                                        onClick={() => handleCandidateSelect(candidate)}
                                        disabled={isSelectingCandidate}
                                        variant={isFaithful ? 'outline' : 'default'}
                                        className={isFaithful
                                            ? 'w-full bg-white/90 hover:bg-white text-slate-800 border-slate-300'
                                            : 'w-full bg-green-600 hover:bg-green-700 text-white'}
                                    >
                                        {isSelectingCandidate ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                                        ) : `Keep ${isFaithful ? 'Faithful' : 'Designed'}`}
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : activeComparison ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-4 w-full md:w-auto md:h-full md:max-w-full">
                    {/* OLD COVER VERSION (Left) */}
                    <div className="flex flex-col items-center bg-white relative min-h-[420px] md:min-h-0 md:h-full md:w-auto md:aspect-[4/5] border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
                            <span className="text-sm font-bold tracking-wider text-white uppercase px-3 py-1 bg-slate-700/80 rounded">OLD</span>
                        </div>
                        <div
                            className={`relative w-full flex-1 min-h-[420px] md:min-h-0 transition-opacity ${handleImageClick ? 'cursor-pointer hover:opacity-95' : ''}`}
                            onClick={handleImageClick ? () => handleImageClick(activeComparison.side, activeComparison.oldUrl) : undefined}
                        >
                            <img
                                src={activeComparison.oldUrl}
                                alt="Previous cover"
                                className="w-full h-full object-contain block"
                            />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                            <Button
                                onClick={handleComparisonKeepOld}
                                disabled={isComparisonReverting}
                                variant="outline"
                                className="w-full bg-white/90 hover:bg-white text-slate-800 border-slate-300"
                            >
                                {isComparisonReverting ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reverting...</>
                                ) : 'Revert Old'}
                            </Button>
                        </div>
                    </div>

                    {/* NEW COVER VERSION (Right) */}
                    <div className="flex flex-col items-center bg-slate-50/10 relative min-h-[420px] md:min-h-0 md:h-full md:w-auto md:aspect-[4/5] border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
                            <span className="text-sm font-bold tracking-wider text-white uppercase px-3 py-1 bg-green-600/90 rounded">NEW</span>
                        </div>
                        <div
                            className={`relative w-full flex-1 min-h-[420px] md:min-h-0 transition-opacity ${handleImageClick ? 'cursor-pointer hover:opacity-95' : ''}`}
                            onClick={handleImageClick ? () => handleImageClick(activeComparison.side, activeComparison.newUrl) : undefined}
                        >
                            <img
                                src={activeComparison.newUrl}
                                alt="New cover"
                                className="w-full h-full object-contain block"
                            />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                            <Button
                                onClick={activeComparison.onKeepNew}
                                disabled={isComparisonReverting}
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                            >
                                Keep New
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-4 w-full md:w-auto md:h-full md:max-w-full">
                    <div className="order-2 md:order-1 md:h-full md:w-auto md:aspect-[4/5] min-h-0">
                        <CoverSidePane
                            side="back"
                            imageUrl={cover.back_url}
                            isRegenerating={isBackRegenerating}
                            onRegenerate={handleBackRegenerate}
                            onImageClick={handleImageClick}
                            emptyCta={cover.back_url ? undefined : {
                                label: 'Create Back Cover',
                                onClick: handleBackRegenerate,
                            }}
                        />
                    </div>
                    <div className="order-1 md:order-2 md:h-full md:w-auto md:aspect-[4/5] min-h-0">
                        <CoverSidePane
                            side="front"
                            imageUrl={cover.front_url}
                            isRegenerating={isFrontRegenerating}
                            onRegenerate={() => setIsFrontRegenOpen(true)}
                            onRemaster={handleFrontRemaster}
                            onImageClick={handleImageClick}
                        />
                    </div>
                </div>
            )}

            {/* Full-image lightbox — click image to expand; arrows / ← → keys switch front ↔ back when both exist. */}
            <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
                <DialogContent
                    showCloseButton={false}
                    className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                    aria-describedby={undefined}
                >
                    <DialogTitle className="sr-only">
                        {lightboxLabel ? `${lightboxLabel} — full size` : 'Full size view'}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Use the arrow buttons or keyboard to switch between front and back cover when both are available.
                    </DialogDescription>
                    <div className="relative w-full h-full flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
                        {lightbox && (
                            <img
                                src={lightbox.url}
                                alt={lightboxLabel || 'Cover'}
                                className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                        {canNavigateLightbox && lightbox && (
                            <>
                                <button
                                    type="button"
                                    disabled={lightbox.side === 'back'}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-white/90 bg-black/50 hover:bg-black/70 rounded-full p-3 z-50 pointer-events-auto transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-black/50"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        goLightboxToBack()
                                    }}
                                    aria-label="View back cover"
                                >
                                    <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
                                </button>
                                <button
                                    type="button"
                                    disabled={lightbox.side === 'front'}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-white/90 bg-black/50 hover:bg-black/70 rounded-full p-3 z-50 pointer-events-auto transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-black/50"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        goLightboxToFront()
                                    }}
                                    aria-label="View front cover"
                                >
                                    <ChevronRight className="w-7 h-7" strokeWidth={2.5} />
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            className="absolute top-6 right-6 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50 pointer-events-auto cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation()
                                setLightbox(null)
                            }}
                        >
                            <span className="sr-only">Close</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Front regen modal */}
            <CoverFrontRegenModal
                open={isFrontRegenOpen}
                onOpenChange={setIsFrontRegenOpen}
                cover={cover}
                pages={pages}
                onSubmitStart={handleFrontRegenStart}
                onSuccess={handleFrontRegenSuccess}
                onFailure={handleFrontRegenFailure}
            />

            {/* Back regen modal */}
            <CoverBackRegenModal
                open={isBackRegenOpen}
                onOpenChange={setIsBackRegenOpen}
                cover={cover}
                onSubmitStart={handleBackRegenStart}
                onSuccess={handleBackRegenSuccess}
                onFailure={handleBackRegenFailure}
            />
        </div>
    )
}
