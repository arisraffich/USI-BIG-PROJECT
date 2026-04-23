'use client'

import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, BookImage } from 'lucide-react'
import { toast } from 'sonner'
import JSZip from 'jszip'

interface CoverModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
    pageId: string
    pageNumber: number
}

type Stage = 'idle' | 'cover' | 'lineart'

function sanitizeFilename(input: string): string {
    return input
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 80) || 'cover'
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

export function CoverModal({
    open,
    onOpenChange,
    projectId,
    pageId,
    pageNumber,
}: CoverModalProps) {
    const [title, setTitle] = useState('')
    const [subtitle, setSubtitle] = useState('')
    const [includeLineArt, setIncludeLineArt] = useState(true)
    const [stage, setStage] = useState<Stage>('idle')
    const [error, setError] = useState<string | null>(null)

    const isGenerating = stage !== 'idle'

    const handleOpenChange = useCallback((next: boolean) => {
        if (isGenerating) return // block close while generating
        if (!next) {
            setTitle('')
            setSubtitle('')
            setError(null)
        }
        onOpenChange(next)
    }, [isGenerating, onOpenChange])

    const handleGenerate = useCallback(async () => {
        const trimmedTitle = title.trim()
        if (!trimmedTitle) {
            setError('Title is required')
            return
        }

        setError(null)
        setStage('cover')

        const safeTitle = sanitizeFilename(trimmedTitle)

        try {
            // ---------- STAGE 1: Generate cover ----------
            const coverRes = await fetch('/api/covers/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId,
                    title: trimmedTitle,
                    subtitle: subtitle.trim() || undefined,
                }),
            })

            if (!coverRes.ok) {
                const errData = await coverRes.json().catch(() => ({} as { error?: string }))
                const msg = errData?.error || 'Cover generation failed'
                setError(msg)
                toast.error(msg)
                setStage('idle')
                return
            }

            const coverBlob = await coverRes.blob()

            // ---------- STAGE 2: Line art (optional, graceful fallback) ----------
            if (includeLineArt) {
                setStage('lineart')

                let lineArtBlob: Blob | null = null
                try {
                    const coverFile = new File([coverBlob], `${safeTitle}-cover.png`, { type: 'image/png' })
                    const formData = new FormData()
                    formData.append('file', coverFile)

                    const lineArtRes = await fetch('/api/line-art', {
                        method: 'POST',
                        body: formData,
                    })

                    if (lineArtRes.ok) {
                        lineArtBlob = await lineArtRes.blob()
                    } else {
                        const errData = await lineArtRes.json().catch(() => ({} as { error?: string }))
                        throw new Error(errData?.error || 'Line art request failed')
                    }
                } catch (lineArtErr) {
                    console.warn('[Cover] Line art failed, falling back to cover-only:', lineArtErr)
                    toast.warning('Line art failed — downloading cover only.')
                }

                if (lineArtBlob) {
                    // Both succeeded → zip + download
                    const zip = new JSZip()
                    zip.file(`${safeTitle}-cover.png`, coverBlob)
                    zip.file(`${safeTitle}-cover-lineart.png`, lineArtBlob)
                    const zipBlob = await zip.generateAsync({ type: 'blob' })
                    triggerDownload(zipBlob, `${safeTitle}-cover.zip`)
                    toast.success('Cover + line art downloaded!')
                } else {
                    // Line art failed → deliver cover only
                    triggerDownload(coverBlob, `${safeTitle}-cover.png`)
                }
            } else {
                // Checkbox OFF → today's behavior, single PNG
                triggerDownload(coverBlob, `${safeTitle}-cover.png`)
                toast.success('Cover downloaded!')
            }

            setTitle('')
            setSubtitle('')
            setStage('idle')
            onOpenChange(false)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Cover generation failed'
            setError(msg)
            toast.error(msg)
            setStage('idle')
        }
    }, [title, subtitle, includeLineArt, projectId, pageId, onOpenChange])

    // Progress button label
    let buttonLabel: React.ReactNode
    if (stage === 'cover') {
        buttonLabel = (
            <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {includeLineArt ? 'Generating cover... (1/2)' : 'Generating cover...'}
            </>
        )
    } else if (stage === 'lineart') {
        buttonLabel = (
            <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating line art... (2/2)
            </>
        )
    } else {
        buttonLabel = (
            <>
                <BookImage className="w-4 h-4 mr-2" />
                Generate & Download
            </>
        )
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="sm:max-w-md"
                onPointerDownOutside={(e) => { if (isGenerating) e.preventDefault() }}
                onEscapeKeyDown={(e) => { if (isGenerating) e.preventDefault() }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookImage className="w-5 h-5 text-purple-600" />
                        Create Cover
                    </DialogTitle>
                    <DialogDescription>
                        Using page {pageNumber} illustration as the reference. Author name and aspect ratio are pulled from project settings.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="cover-title" className="text-sm font-semibold text-slate-700">
                            Title <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="cover-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="The book's title"
                            disabled={isGenerating}
                            maxLength={120}
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="cover-subtitle" className="text-sm font-semibold text-slate-700">
                            Subtitle <span className="text-slate-400 font-normal">(optional)</span>
                        </Label>
                        <Input
                            id="cover-subtitle"
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="A short tagline"
                            disabled={isGenerating}
                            maxLength={120}
                        />
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                        <input
                            type="checkbox"
                            checked={includeLineArt}
                            onChange={(e) => setIncludeLineArt(e.target.checked)}
                            disabled={isGenerating}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-purple-600 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="text-sm text-slate-700 leading-snug">
                            Also include line art
                            <span className="text-slate-400 font-normal"> (adds ~30s, bundled as ZIP)</span>
                        </span>
                    </label>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || !title.trim()}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {buttonLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
