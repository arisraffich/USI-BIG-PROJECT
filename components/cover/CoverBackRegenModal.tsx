'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles, ImagePlus, X } from 'lucide-react'
import { Cover } from '@/types/cover'

interface CoverBackRegenModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    cover: Cover
    onSubmitStart: () => void
    onSuccess: (payload: { cover: Cover, newUrl: string, oldUrl: string | null }) => void
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

export function CoverBackRegenModal({
    open,
    onOpenChange,
    cover,
    onSubmitStart,
    onSuccess,
    onFailure,
}: CoverBackRegenModalProps) {
    const [instructions, setInstructions] = useState('')
    const [addedImages, setAddedImages] = useState<Array<{ dataUrl: string, name: string }>>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reset every time the modal opens. We don't pre-fill instructions on purpose —
    // each regen should be a fresh, deliberate tweak.
    useEffect(() => {
        if (open) {
            setInstructions('')
            setAddedImages([])
            setError(null)
        }
    }, [open])

    const hasExistingBack = !!cover.back_url
    const primaryLabel = hasExistingBack ? 'Regenerate Back Cover' : 'Generate Back Cover'

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
                console.error('Failed to read back-cover reference image:', error)
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
        if (!cover.front_url) {
            setError('Generate the front cover first — back cover uses it as its reference.')
            return
        }

        setError(null)
        setIsSubmitting(true)
        onSubmitStart()
        onOpenChange(false)

        try {
            const res = await fetch('/api/covers/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coverId: cover.id,
                    side: 'back',
                    instructions: instructions.trim() || undefined,
                    addedImages: addedImages.map(i => i.dataUrl),
                }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({} as { error?: string }))
                console.error('Back cover generation failed:', errData?.error || res.statusText)
                onFailure()
                return
            }

            const data = await res.json() as { cover: Cover, newUrl: string, oldUrl: string | null }
            onSuccess(data)
        } catch (err) {
            console.error('Back cover generation failed:', err)
            onFailure()
        } finally {
            setIsSubmitting(false)
        }
    }, [cover.id, cover.front_url, instructions, addedImages, onSubmitStart, onSuccess, onFailure, onOpenChange])

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
                        {primaryLabel}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Generate or regenerate the back cover using optional instructions and reference images.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Instructions */}
                    <div className="space-y-1.5">
                        <Label htmlFor="back-regen-instructions" className="text-sm font-semibold text-slate-700">
                            Instructions <span className="text-slate-400 font-normal">(optional)</span>
                        </Label>
                        <textarea
                            id="back-regen-instructions"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            disabled={isSubmitting}
                            rows={3}
                            maxLength={500}
                            placeholder="e.g. keep the color palette warmer; add a subtle landscape silhouette; no characters"
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
                        disabled={isSubmitting || !cover.front_url}
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
                                {primaryLabel}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
