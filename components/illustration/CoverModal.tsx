'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, BookImage } from 'lucide-react'
import { toast } from 'sonner'
import { Cover } from '@/types/cover'

interface CoverModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
    pageId: string
    pageNumber: number
    onCoverCreated?: (cover: Cover) => void
}

export function CoverModal({
    open,
    onOpenChange,
    projectId,
    pageId,
    pageNumber,
    onCoverCreated,
}: CoverModalProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()

    const [title, setTitle] = useState('')
    const [subtitle, setSubtitle] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleOpenChange = useCallback((next: boolean) => {
        if (isGenerating) return
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
        setIsGenerating(true)

        try {
            const res = await fetch('/api/covers/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    sourcePageId: pageId,
                    title: trimmedTitle,
                    subtitle: subtitle.trim() || undefined,
                }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({} as { error?: string }))
                const msg = errData?.error || 'Cover generation failed'
                setError(msg)
                toast.error(msg)
                setIsGenerating(false)
                return
            }

            const data = await res.json() as { cover: Cover }

            onCoverCreated?.(data.cover)

            setTitle('')
            setSubtitle('')
            setIsGenerating(false)
            onOpenChange(false)

            toast.success('Cover created — redirecting...')

            // Switch to the Cover tab.
            const params = new URLSearchParams(searchParams?.toString() || '')
            params.set('tab', 'cover')
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Cover generation failed'
            setError(msg)
            toast.error(msg)
            setIsGenerating(false)
        }
    }, [title, subtitle, projectId, pageId, onOpenChange, onCoverCreated, router, searchParams, pathname])

    const buttonLabel = isGenerating ? (
        <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating cover... (~60-120s)
        </>
    ) : (
        <>
            <BookImage className="w-4 h-4 mr-2" />
            Generate Cover
        </>
    )

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
