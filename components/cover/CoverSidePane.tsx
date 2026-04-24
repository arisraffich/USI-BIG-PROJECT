'use client'

import { useCallback, useState } from 'react'
import { Loader2, Sparkles, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Comparison {
    oldUrl: string
    newUrl: string
}

interface CoverSidePaneProps {
    /** Which side this pane represents — drives filename suffix + a11y labels. */
    side: 'front' | 'back'
    /** The canonical URL currently stored in the cover row. */
    imageUrl: string | null
    /** Shown as a loading overlay while a regen is in flight for this side. */
    isRegenerating: boolean
    /** When present, the pane renders OLD vs NEW side-by-side with Keep buttons. */
    comparison: Comparison | null
    /** Opens the side's regen modal. */
    onRegenerate: () => void
    /** Commit NEW — simply exits comparison mode (`newUrl` is already the canonical URL in DB). */
    onKeepNew: () => void
    /** Revert to OLD — caller hits /api/covers/revert and updates state. */
    onKeepOld: () => Promise<void>
    /** Opens fullscreen lightbox; parent uses side for front/back navigation. */
    onImageClick?: (side: 'front' | 'back', url: string) => void
    /**
     * For the back pane: when back_url is null and we're not generating, render
     * a "Create Back Cover" CTA instead of an empty placeholder. Only meaningful
     * for the back side — ignored on the front.
     */
    emptyCta?: {
        label: string
        onClick: () => void
    }
}

export function CoverSidePane({
    side,
    imageUrl,
    isRegenerating,
    comparison,
    onRegenerate,
    onKeepNew,
    onKeepOld,
    onImageClick,
    emptyCta,
}: CoverSidePaneProps) {
    const [isRevertingToOld, setIsRevertingToOld] = useState(false)

    const handleKeepOld = useCallback(async () => {
        setIsRevertingToOld(true)
        try {
            await onKeepOld()
        } finally {
            setIsRevertingToOld(false)
        }
    }, [onKeepOld])

    const sideLabel = side === 'front' ? 'Front Cover' : 'Back Cover'

    // --- Comparison view -------------------------------------------------
    // Keep the label here — it's essential for admin to know which side they're
    // picking between. "Front Cover — pick one" / "Back Cover — pick one".
    if (comparison) {
        return (
            <div className="border border-purple-300 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="px-4 py-2.5 border-b border-purple-200 bg-purple-50 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                        {sideLabel} — pick one
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-y sm:divide-y-0 divide-slate-200">
                    {/* OLD */}
                    <div className="flex flex-col">
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Old</span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleKeepOld}
                                disabled={isRevertingToOld}
                                className="h-7 px-2 text-[11px] gap-1"
                            >
                                {isRevertingToOld ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Reverting...</>
                                ) : (
                                    <><Check className="w-3 h-3" /> Keep OLD</>
                                )}
                            </Button>
                        </div>
                        <div
                            className={`flex-1 bg-slate-50/50 min-h-0 ${onImageClick ? 'cursor-zoom-in hover:bg-slate-100/60 transition-colors' : ''}`}
                            onClick={onImageClick ? () => onImageClick(side, comparison.oldUrl) : undefined}
                        >
                            <img src={comparison.oldUrl} alt="Old cover" className="w-full h-auto block" />
                        </div>
                    </div>
                    {/* NEW */}
                    <div className="flex flex-col">
                        <div className="px-3 py-2 bg-purple-50 border-b border-purple-200 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700">New</span>
                            <Button
                                size="sm"
                                onClick={onKeepNew}
                                disabled={isRevertingToOld}
                                className="h-7 px-2 text-[11px] gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                            >
                                <Check className="w-3 h-3" /> Keep NEW
                            </Button>
                        </div>
                        <div
                            className={`flex-1 bg-slate-50/50 min-h-0 ${onImageClick ? 'cursor-zoom-in hover:bg-slate-100/60 transition-colors' : ''}`}
                            onClick={onImageClick ? () => onImageClick(side, comparison.newUrl) : undefined}
                        >
                            <img src={comparison.newUrl} alt="New cover" className="w-full h-auto block" />
                        </div>
                    </div>
                </div>
                <div className="px-4 py-2 border-t border-slate-200 bg-amber-50/70 text-[11px] text-amber-800">
                    Don&apos;t refresh — if you reload the page now, the OLD version won&apos;t be recoverable.
                </div>
            </div>
        )
    }

    // --- Normal view -----------------------------------------------------
    // No header bar — Regenerate floats top-right when an image exists.
    return (
        <div className="relative group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-sm">
            {/* With a real cover image: full-bleed width (no letterboxing from a fixed aspect box).
                Empty / placeholder: keep a stable 4:5 frame so layout doesn’t collapse. */}
            <div
                className={
                    imageUrl
                        ? 'relative w-full'
                        : 'relative aspect-[4/5] w-full flex items-center justify-center'
                }
            >
                {imageUrl ? (
                    <div
                        className={`w-full ${onImageClick ? 'cursor-zoom-in' : ''}`}
                        onClick={onImageClick ? () => onImageClick(side, imageUrl) : undefined}
                    >
                        <img src={imageUrl} alt={sideLabel} className="w-full h-auto block" />
                    </div>
                ) : emptyCta ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                        <Button
                            onClick={emptyCta.onClick}
                            disabled={isRegenerating}
                            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                        >
                            <Sparkles className="w-4 h-4" />
                            {emptyCta.label}
                        </Button>
                    </div>
                ) : (
                    <span className="text-sm text-slate-400">{sideLabel} not yet generated</span>
                )}

                {imageUrl && !isRegenerating && (
                    <Button
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onRegenerate()
                        }}
                        title={`Regenerate ${sideLabel}`}
                        aria-label={`Regenerate ${sideLabel}`}
                        className="absolute top-4 right-4 z-20 h-9 w-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                )}

                {isRegenerating && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                        <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">
                                Regenerating {sideLabel.toLowerCase()}...
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">This takes ~60-120s</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
