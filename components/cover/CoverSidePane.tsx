'use client'

import { Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CoverSidePaneProps {
    /** Which side this pane represents — drives filename suffix + a11y labels. */
    side: 'front' | 'back'
    /** The canonical URL currently stored in the cover row. */
    imageUrl: string | null
    /** Shown as a loading overlay while a regen is in flight for this side. */
    isRegenerating: boolean
    /** Opens the side's regen modal. */
    onRegenerate: () => void
    /** Quality refresh for the front cover; bypasses the regen modal. */
    onRemaster?: () => void
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
    onRegenerate,
    onRemaster,
    onImageClick,
    emptyCta,
}: CoverSidePaneProps) {
    const sideLabel = side === 'front' ? 'Front Cover' : 'Back Cover'

    return (
        <div className="relative group h-full min-h-0 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-sm">
            {/* Desktop: height-driven so paired covers fit the viewport without page scroll.
                Mobile: natural stacked sizing remains scrollable. */}
            <div
                className={
                    imageUrl
                        ? 'relative w-full h-full min-h-0'
                        : 'relative aspect-[4/5] md:aspect-auto md:h-full w-full flex items-center justify-center'
                }
            >
                {imageUrl ? (
                    <div
                        className={`w-full h-full min-h-0 flex items-center justify-center ${onImageClick ? 'cursor-zoom-in' : ''}`}
                        onClick={onImageClick ? () => onImageClick(side, imageUrl) : undefined}
                    >
                        <img src={imageUrl} alt={sideLabel} className="max-w-full max-h-full object-contain block" />
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
                    <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                        {onRemaster && (
                            <Button
                                size="icon"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRemaster()
                                }}
                                title={`Remaster ${sideLabel}`}
                                aria-label={`Remaster ${sideLabel}`}
                                className="h-9 w-9 rounded-full bg-white/95 hover:bg-white text-purple-700 hover:text-purple-800 border border-purple-200 shadow-md"
                            >
                                <Sparkles className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation()
                                onRegenerate()
                            }}
                            title={`Regenerate ${sideLabel}`}
                            aria-label={`Regenerate ${sideLabel}`}
                            className="h-9 w-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>
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
