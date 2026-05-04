'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, Sparkles, ImagePlus, X, ChevronDown, Bookmark } from 'lucide-react'
import { Cover } from '@/types/cover'
import { Page } from '@/types/page'

interface CoverFrontRegenModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    cover: Cover
    pages: Page[]
    /** Called synchronously just before the API is hit so the parent can show a loading overlay on the front pane. */
    onSubmitStart: () => void
    /** Called with the successful regen payload. Parent updates state + enters comparison mode. */
    onSuccess: (payload: { cover: Cover, newUrl: string, oldUrl: string | null }) => void
    /** Called on failure or cancellation so the parent can clear its loading overlay. */
    onFailure: () => void
}

const MAX_IMAGES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
        reader.readAsDataURL(file)
    })
}

export function CoverFrontRegenModal({
    open,
    onOpenChange,
    cover,
    pages,
    onSubmitStart,
    onSuccess,
    onFailure,
}: CoverFrontRegenModalProps) {
    // Empty string = "Current cover" (edit mode). A page UUID = redesign mode.
    const [sourcePageId, setSourcePageId] = useState<string>('')
    const [instructions, setInstructions] = useState('')
    const [addedImages, setAddedImages] = useState<Array<{ dataUrl: string, name: string }>>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reset fields whenever the modal opens with a fresh cover.
    useEffect(() => {
        if (open) {
            setSourcePageId('')
            setInstructions('')
            setAddedImages([])
            setError(null)
        }
    }, [open, cover])

    // Only pages that have a generated illustration are valid as a reference.
    const eligiblePages = useMemo(() => {
        return pages
            .filter(p => !!p.illustration_url)
            .sort((a, b) => a.page_number - b.page_number)
    }, [pages])

    const handleOpenChange = useCallback((next: boolean) => {
        if (isSubmitting) return
        onOpenChange(next)
    }, [isSubmitting, onOpenChange])

    const handleAddFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return

        const remaining = MAX_IMAGES - addedImages.length
        if (remaining <= 0) {
            return
        }

        const toProcess = Array.from(files).slice(0, remaining)
        const next: Array<{ dataUrl: string, name: string }> = []

        for (const file of toProcess) {
            if (!file.type.startsWith('image/')) {
                continue
            }
            if (file.size > MAX_FILE_BYTES) {
                continue
            }
            try {
                const dataUrl = await readFileAsDataUrl(file)
                next.push({ dataUrl, name: file.name })
            } catch (error) {
                console.error('Failed to read front-cover reference image:', error)
            }
        }

        if (next.length > 0) {
            setAddedImages(prev => [...prev, ...next])
        }
    }, [addedImages.length])

    const handleRemoveImage = useCallback((idx: number) => {
        setAddedImages(prev => prev.filter((_, i) => i !== idx))
    }, [])

    const handleSubmit = useCallback(async () => {
        setError(null)
        setIsSubmitting(true)
        onSubmitStart()
        onOpenChange(false) // close modal immediately; loading overlay owns the UI now

        try {
            const res = await fetch('/api/covers/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coverId: cover.id,
                    side: 'front',
                    // Title/subtitle are no longer editable here — backend falls
                    // back to the values already stored on the cover.
                    // Omit sourcePageId when "Current cover" is selected so the
                    // backend treats it as edit mode and keeps the existing
                    // source_page_id unchanged.
                    sourcePageId: sourcePageId || undefined,
                    instructions: instructions.trim() || undefined,
                    addedImages: addedImages.map(i => i.dataUrl),
                }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({} as { error?: string }))
                console.error('Front cover regeneration failed:', errData?.error || res.statusText)
                onFailure()
                return
            }

            const data = await res.json() as { cover: Cover, newUrl: string, oldUrl: string | null }
            onSuccess(data)
        } catch (err) {
            console.error('Front cover regeneration failed:', err)
            onFailure()
        } finally {
            setIsSubmitting(false)
        }
    }, [sourcePageId, instructions, addedImages, cover.id, onSubmitStart, onSuccess, onFailure, onOpenChange])

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
                onPointerDownOutside={(e) => { if (isSubmitting) e.preventDefault() }}
                onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault() }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        Regenerate Front Cover
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Regenerate the front cover using the current cover or an illustrated page as the reference.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Reference — "Current cover" (edit mode) by default, or an
                        interior page (full redesign from that page). */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-700">
                            Reference
                        </Label>
                        {(() => {
                            const isCurrentCover = sourcePageId === ''
                            const selectedPage = isCurrentCover
                                ? null
                                : eligiblePages.find(p => p.id === sourcePageId)
                            return (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild disabled={isSubmitting}>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between h-auto min-h-[40px] py-1.5 px-3"
                                        >
                                            <span className="flex items-center gap-2.5 min-w-0">
                                                {isCurrentCover ? (
                                                    <>
                                                        {cover.front_url ? (
                                                            <img
                                                                src={cover.front_url}
                                                                alt="Current cover"
                                                                className="w-8 h-8 rounded object-cover border border-slate-200 flex-shrink-0"
                                                            />
                                                        ) : (
                                                            <Bookmark className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                                        )}
                                                        <span className="truncate">
                                                            Current cover
                                                            <span className="text-slate-400 font-normal ml-1.5">edit mode</span>
                                                        </span>
                                                    </>
                                                ) : selectedPage ? (
                                                    <>
                                                        {selectedPage.illustration_url ? (
                                                            <img
                                                                src={selectedPage.illustration_url}
                                                                alt={`Page ${selectedPage.page_number}`}
                                                                className="w-8 h-8 rounded object-cover border border-slate-200 flex-shrink-0"
                                                            />
                                                        ) : (
                                                            <Bookmark className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                                        )}
                                                        <span className="truncate">
                                                            Page {selectedPage.page_number}
                                                            <span className="text-slate-400 font-normal ml-1.5">redesign</span>
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-500">Pick a reference…</span>
                                                )}
                                            </span>
                                            <ChevronDown className="w-4 h-4 ml-2 opacity-50 flex-shrink-0" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="start"
                                        className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[300px] overflow-y-auto"
                                    >
                                        <DropdownMenuItem
                                            onClick={() => setSourcePageId('')}
                                            className="cursor-pointer flex items-center gap-2.5 py-2"
                                        >
                                            {cover.front_url ? (
                                                <img
                                                    src={cover.front_url}
                                                    alt="Current cover"
                                                    className="w-8 h-8 rounded object-cover border border-slate-200 flex-shrink-0"
                                                />
                                            ) : (
                                                <Bookmark className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                            )}
                                            <span className="flex-1">Current cover</span>
                                            <span className="text-xs text-slate-400">edit mode</span>
                                        </DropdownMenuItem>
                                        {eligiblePages.map(p => (
                                            <DropdownMenuItem
                                                key={p.id}
                                                onClick={() => setSourcePageId(p.id)}
                                                className="cursor-pointer flex items-center gap-2.5 py-2"
                                            >
                                                {p.illustration_url ? (
                                                    <img
                                                        src={p.illustration_url}
                                                        alt={`Page ${p.page_number}`}
                                                        className="w-8 h-8 rounded object-cover border border-slate-200 flex-shrink-0"
                                                    />
                                                ) : (
                                                    <Bookmark className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                                )}
                                                <span className="flex-1">Page {p.page_number}</span>
                                                <span className="text-xs text-slate-400">redesign</span>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )
                        })()}
                    </div>

                    {/* Instructions */}
                    <div className="space-y-1.5">
                        <Label htmlFor="front-regen-instructions" className="text-sm font-semibold text-slate-700">
                            Instructions <span className="text-slate-400 font-normal">(optional)</span>
                        </Label>
                        <textarea
                            id="front-regen-instructions"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            disabled={isSubmitting}
                            rows={3}
                            maxLength={500}
                            placeholder="e.g. make the title larger; use a warmer color palette; keep the character in the same pose"
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                        />
                    </div>

                    {/* Added images — upload button + inline "(optional, max N)" hint. */}
                    <div className="space-y-2">
                        {addedImages.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {addedImages.map((img, i) => (
                                    <div key={i} className="relative group">
                                        <img
                                            src={img.dataUrl}
                                            alt={img.name}
                                            className="w-16 h-16 object-cover rounded-md border border-slate-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveImage(i)}
                                            disabled={isSubmitting}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 shadow-sm disabled:opacity-50"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {addedImages.length < MAX_IMAGES && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <label className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 cursor-pointer ${isSubmitting ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <ImagePlus className="w-3.5 h-3.5" />
                                    Upload images
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        disabled={isSubmitting}
                                        onChange={(e) => {
                                            handleAddFiles(e.target.files)
                                            e.target.value = ''
                                        }}
                                    />
                                </label>
                                <span className="text-xs text-slate-400">
                                    optional, max {MAX_IMAGES}, max 10MB
                                </span>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Regenerate Front Cover
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
