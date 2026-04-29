'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { toast } from 'sonner'
import { BookImage, Check, Download, Loader2, Upload, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CoverDesignModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

type CandidateKind = 'faithful' | 'designed'
type AspectChoice = 'match' | '8:10' | '8.5:8.5' | '8.5:11'

interface CoverCandidate {
    kind: CandidateKind
    label: string
    dataUrl: string
}

interface CoverLightbox {
    label: string
    url: string
}

function slugify(value: string): string {
    return value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase() || 'cover'
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/data:([^;]+)/)?.[1] || 'image/png'
    const bytes = atob(base64)
    const array = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i)
    return new Blob([array], { type: mime })
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const blob = dataUrlToBlob(dataUrl)
    return new File([blob], filename, { type: blob.type || 'image/png' })
}

export function CoverDesignModal({ open, onOpenChange }: CoverDesignModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [referenceFile, setReferenceFile] = useState<File | null>(null)
    const [referencePreview, setReferencePreview] = useState<string | null>(null)
    const [title, setTitle] = useState('')
    const [subtitle, setSubtitle] = useState('')
    const [author, setAuthor] = useState('')
    const [aspectRatio, setAspectRatio] = useState<AspectChoice>('match')
    const [effectiveAspectRatio, setEffectiveAspectRatio] = useState<string>('match')
    const [candidates, setCandidates] = useState<CoverCandidate[]>([])
    const [selectedKind, setSelectedKind] = useState<CandidateKind | null>(null)
    const [isFrontPicked, setIsFrontPicked] = useState(false)
    const [backCoverDataUrl, setBackCoverDataUrl] = useState<string | null>(null)
    const [downloadOptionsOpen, setDownloadOptionsOpen] = useState(false)
    const [includeLineArtInDownload, setIncludeLineArtInDownload] = useState(true)
    const [isGeneratingFront, setIsGeneratingFront] = useState(false)
    const [isGeneratingBack, setIsGeneratingBack] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lightbox, setLightbox] = useState<CoverLightbox | null>(null)
    const [isDesktop, setIsDesktop] = useState(true)

    const selectedCandidate = useMemo(
        () => candidates.find(candidate => candidate.kind === selectedKind) || null,
        [candidates, selectedKind]
    )
    const isBusy = isGeneratingFront || isGeneratingBack || isDownloading

    useEffect(() => {
        if (typeof window === 'undefined') return
        const mq = window.matchMedia('(min-width: 768px)')
        const update = () => setIsDesktop(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    const reset = useCallback(() => {
        if (referencePreview) URL.revokeObjectURL(referencePreview)
        setReferenceFile(null)
        setReferencePreview(null)
        setTitle('')
        setSubtitle('')
        setAuthor('')
        setAspectRatio('match')
        setEffectiveAspectRatio('match')
        setCandidates([])
        setSelectedKind(null)
        setIsFrontPicked(false)
        setBackCoverDataUrl(null)
        setDownloadOptionsOpen(false)
        setIncludeLineArtInDownload(true)
        setIsGeneratingFront(false)
        setIsGeneratingBack(false)
        setIsDownloading(false)
        setError(null)
        setLightbox(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [referencePreview])

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        if (!nextOpen && isBusy) {
            const confirmed = window.confirm('Generation or download is in progress. Close anyway?')
            if (!confirmed) return
        }
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }, [isBusy, onOpenChange, reset])

    const handleFile = useCallback((file: File | null) => {
        if (!file || !file.type.startsWith('image/')) return
        if (referencePreview) URL.revokeObjectURL(referencePreview)
        setReferenceFile(file)
        setReferencePreview(URL.createObjectURL(file))
        setCandidates([])
        setSelectedKind(null)
        setIsFrontPicked(false)
        setBackCoverDataUrl(null)
        setError(null)
    }, [referencePreview])

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        handleFile(event.dataTransfer.files?.[0] || null)
    }, [handleFile])

    const handleGenerateFront = useCallback(async () => {
        if (!referenceFile || !title.trim() || !author.trim()) return
        setError(null)
        setIsGeneratingFront(true)
        setCandidates([])
        setSelectedKind(null)
        setIsFrontPicked(false)
        setBackCoverDataUrl(null)

        try {
            const formData = new FormData()
            formData.append('file', referenceFile)
            formData.append('title', title.trim())
            formData.append('subtitle', subtitle.trim())
            formData.append('author', author.trim())
            formData.append('aspectRatio', aspectRatio)

            const response = await fetch('/api/tools/cover/generate-front', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const body = await response.json().catch(() => ({} as { error?: string }))
                throw new Error(body.error || 'Cover generation failed')
            }

            const data = await response.json() as {
                aspectRatio: string
                candidates: Record<CandidateKind, CoverCandidate>
            }
            const nextCandidates = [data.candidates.faithful, data.candidates.designed]
            setEffectiveAspectRatio(data.aspectRatio || aspectRatio)
            setCandidates(nextCandidates)
            setSelectedKind(null)
            setIsFrontPicked(false)
            toast.success('Cover options generated')
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Cover generation failed'
            setError(message)
            toast.error(message)
        } finally {
            setIsGeneratingFront(false)
        }
    }, [aspectRatio, author, referenceFile, subtitle, title])

    const handlePickFront = useCallback((candidate: CoverCandidate) => {
        if (isBusy) return
        const confirmed = window.confirm('Use this as the final front cover? The other option will be discarded from this session.')
        if (!confirmed) return

        setCandidates([candidate])
        setSelectedKind(candidate.kind)
        setIsFrontPicked(true)
        setBackCoverDataUrl(null)
        toast.success('Front cover selected')
    }, [isBusy])

    const handleGenerateBack = useCallback(async () => {
        if (!selectedCandidate || !isFrontPicked) return
        setError(null)
        setIsGeneratingBack(true)

        try {
            const frontFile = await dataUrlToFile(selectedCandidate.dataUrl, `${slugify(title)}-front.png`)
            const formData = new FormData()
            formData.append('file', frontFile)
            formData.append('aspectRatio', effectiveAspectRatio || aspectRatio)

            const response = await fetch('/api/tools/cover/generate-back', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const body = await response.json().catch(() => ({} as { error?: string }))
                throw new Error(body.error || 'Back cover generation failed')
            }

            const data = await response.json() as { backCover: { dataUrl: string } }
            setBackCoverDataUrl(data.backCover.dataUrl)
            toast.success('Back cover generated')
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Back cover generation failed'
            setError(message)
            toast.error(message)
        } finally {
            setIsGeneratingBack(false)
        }
    }, [aspectRatio, effectiveAspectRatio, isFrontPicked, selectedCandidate, title])

    const generateLineArt = useCallback(async (frontDataUrl: string): Promise<Blob | null> => {
        try {
            const file = await dataUrlToFile(frontDataUrl, `${slugify(title)}-front.png`)
            const formData = new FormData()
            formData.append('file', file)
            const response = await fetch('/api/line-art', { method: 'POST', body: formData })
            if (!response.ok) return null
            return await response.blob()
        } catch (err) {
            console.warn('[Cover Design Tool] Line art failed', err)
            return null
        }
    }, [title])

    const handleDownloadClick = useCallback(() => {
        if (!selectedCandidate || !isFrontPicked || isBusy) return
        setIncludeLineArtInDownload(true)
        setDownloadOptionsOpen(true)
    }, [isBusy, isFrontPicked, selectedCandidate])

    const openLightbox = useCallback((url: string, label: string) => {
        if (!isDesktop) return
        setLightbox({ url, label })
    }, [isDesktop])

    const handleDownload = useCallback(async () => {
        if (!selectedCandidate || !isFrontPicked) return
        setDownloadOptionsOpen(false)
        setIsDownloading(true)
        setError(null)
        const safeTitle = slugify(title)

        try {
            const files: Array<{ name: string, blob: Blob }> = [
                { name: `${safeTitle}-front-cover.png`, blob: dataUrlToBlob(selectedCandidate.dataUrl) },
            ]

            if (includeLineArtInDownload) {
                toast.loading('Creating front cover line art...', { id: 'cover-tool-download', duration: 120_000 })
                const lineArtBlob = await generateLineArt(selectedCandidate.dataUrl)
                if (lineArtBlob) {
                    files.push({ name: `${safeTitle}-front-cover-lineart.png`, blob: lineArtBlob })
                } else {
                    toast.warning('Line art failed. Downloading available cover files only.', { id: 'cover-tool-download', duration: 6000 })
                }
            }

            if (backCoverDataUrl) {
                files.push({ name: `${safeTitle}-back-cover.png`, blob: dataUrlToBlob(backCoverDataUrl) })
            }

            if (files.length === 1) {
                downloadBlob(files[0].blob, files[0].name)
            } else {
                const zip = new JSZip()
                for (const file of files) zip.file(file.name, file.blob)
                const zipBlob = await zip.generateAsync({ type: 'blob' })
                downloadBlob(zipBlob, `${safeTitle}-cover-design.zip`)
            }

            toast.success('Cover download ready', { id: 'cover-tool-download' })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Download failed'
            setError(message)
            toast.error(message, { id: 'cover-tool-download' })
        } finally {
            setIsDownloading(false)
        }
    }, [backCoverDataUrl, generateLineArt, includeLineArtInDownload, isFrontPicked, selectedCandidate, title])

    const canGenerate = !!referenceFile && !!title.trim() && !!author.trim() && !isBusy
    const showCoverOptions = isGeneratingFront || candidates.length > 0

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent
                    className={`${showCoverOptions ? 'sm:max-w-5xl' : 'sm:max-w-md'} max-h-[90vh] flex flex-col`}
                    onPointerDownOutside={(event) => { if (isBusy) event.preventDefault() }}
                    onEscapeKeyDown={(event) => { if (isBusy) event.preventDefault() }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <BookImage className="w-5 h-5 text-purple-600" />
                            Cover Design
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                        {!showCoverOptions ? (
                            <div className="space-y-4">
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={(event) => event.preventDefault()}
                                    onClick={() => !isBusy && fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-slate-300 rounded-lg min-h-[220px] flex items-center justify-center text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/40 transition-colors overflow-hidden bg-white"
                                >
                                    {referencePreview ? (
                                        <img src={referencePreview} alt="Reference" className="w-full h-full max-h-[260px] object-contain" />
                                    ) : (
                                        <div className="p-8">
                                            <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                                            <p className="text-sm font-medium text-slate-700">Upload reference illustration</p>
                                            <p className="text-xs text-slate-500 mt-1">Drop image or click to browse</p>
                                        </div>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(event) => handleFile(event.target.files?.[0] || null)}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cover-tool-title">Title <span className="text-red-500">*</span></Label>
                                        <Input id="cover-tool-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={isBusy} maxLength={120} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cover-tool-subtitle">Subtitle <span className="text-slate-400 font-normal">(optional)</span></Label>
                                        <Input id="cover-tool-subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} disabled={isBusy} maxLength={120} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cover-tool-author">Author <span className="text-red-500">*</span></Label>
                                        <Input id="cover-tool-author" value={author} onChange={(event) => setAuthor(event.target.value)} disabled={isBusy} maxLength={120} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Aspect ratio</Label>
                                        <Select value={aspectRatio} onValueChange={(value) => setAspectRatio(value as AspectChoice)} disabled={isBusy}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="match">Match uploaded image</SelectItem>
                                                <SelectItem value="8:10">4:5 portrait</SelectItem>
                                                <SelectItem value="8.5:8.5">1:1 square</SelectItem>
                                                <SelectItem value="8.5:11">3:4 portrait</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <Button onClick={handleGenerateFront} disabled={!canGenerate} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                                    {isGeneratingFront ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BookImage className="w-4 h-4 mr-2" />}
                                    Generate Cover
                                </Button>

                                {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {isGeneratingFront ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {['Faithful Version', 'Designed Version'].map(label => (
                                                <div
                                                    key={label}
                                                    className="rounded-lg border border-slate-200 overflow-hidden bg-white"
                                                >
                                                    <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100">
                                                        <span className="text-sm font-semibold text-slate-700">{label}</span>
                                                    </div>
                                                    <div className="bg-slate-50 h-[380px] flex items-center justify-center">
                                                        <div className="flex flex-col items-center gap-3 text-slate-400">
                                                            <Loader2 className="w-7 h-7 animate-spin text-purple-600" />
                                                            <span className="text-sm font-medium">Creating cover...</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-3 border-t border-slate-100">
                                                        <Button type="button" disabled className="w-full bg-purple-600 text-white disabled:opacity-60">
                                                            Use This Cover
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {!isFrontPicked ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-purple-100 bg-purple-50 px-3 py-2">
                                                    <span className="text-sm font-medium text-purple-800">Choose one front cover to continue. The other option will be discarded.</span>
                                                    <Button variant="outline" size="sm" onClick={reset} disabled={isBusy} className="bg-white">
                                                        <X className="w-4 h-4 mr-2" />
                                                        New Cover
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {candidates.map(candidate => (
                                                        <div
                                                            key={candidate.kind}
                                                            className="rounded-lg border border-slate-200 overflow-hidden bg-white"
                                                        >
                                                            <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100">
                                                                <span className="text-sm font-semibold text-slate-700">{candidate.label}</span>
                                                            </div>
                                                            <div
                                                                className={`bg-slate-50 h-[380px] flex items-center justify-center ${isDesktop ? 'cursor-zoom-in' : ''}`}
                                                                onClick={() => openLightbox(candidate.dataUrl, candidate.label)}
                                                            >
                                                                <img src={candidate.dataUrl} alt={candidate.label} className="max-w-full max-h-full object-contain" />
                                                            </div>
                                                            <div className="p-3 border-t border-slate-100">
                                                                <Button
                                                                    type="button"
                                                                    onClick={() => handlePickFront(candidate)}
                                                                    disabled={isBusy}
                                                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                                                                >
                                                                    <Check className="w-4 h-4 mr-2" />
                                                                    Use This Cover
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : selectedCandidate ? (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                                        <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100">
                                                            <span className="text-sm font-semibold text-slate-700">Back Cover</span>
                                                            <Button variant="outline" size="sm" onClick={handleGenerateBack} disabled={isBusy}>
                                                                {backCoverDataUrl ? 'Regenerate Back' : 'Generate Back'}
                                                            </Button>
                                                        </div>
                                                        <div className="bg-slate-50 h-[420px] flex items-center justify-center">
                                                            {isGeneratingBack ? (
                                                                <div className="flex flex-col items-center gap-3 text-slate-400">
                                                                    <Loader2 className="w-7 h-7 animate-spin text-purple-600" />
                                                                    <span className="text-sm font-medium">Creating back cover...</span>
                                                                </div>
                                                            ) : backCoverDataUrl ? (
                                                                <button
                                                                    type="button"
                                                                    className={`w-full h-full flex items-center justify-center border-0 bg-transparent p-0 ${isDesktop ? 'cursor-zoom-in' : 'cursor-default'}`}
                                                                    onClick={() => openLightbox(backCoverDataUrl, 'Back Cover')}
                                                                >
                                                                    <img src={backCoverDataUrl} alt="Back cover" className="max-w-full max-h-full object-contain" />
                                                                </button>
                                                            ) : (
                                                                <span className="text-sm text-slate-400">Generate a matching back cover when ready</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="rounded-lg border border-purple-300 ring-2 ring-purple-100 bg-white overflow-hidden">
                                                        <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100">
                                                            <span className="text-sm font-semibold text-slate-700">Front Cover</span>
                                                            <Button variant="outline" size="sm" onClick={reset} disabled={isBusy}>
                                                                Regenerate Front
                                                            </Button>
                                                        </div>
                                                        <div
                                                            className={`bg-slate-50 h-[420px] flex items-center justify-center ${isDesktop ? 'cursor-zoom-in' : ''}`}
                                                            onClick={() => openLightbox(selectedCandidate.dataUrl, 'Front Cover')}
                                                        >
                                                            <img src={selectedCandidate.dataUrl} alt="Picked front cover" className="max-w-full max-h-full object-contain" />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end">
                                                    <Button onClick={handleDownloadClick} disabled={isBusy}>
                                                        {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                                        Download
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!lightbox} onOpenChange={(nextOpen) => !nextOpen && setLightbox(null)}>
                <DialogContent
                    showCloseButton={false}
                    className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                    aria-describedby={undefined}
                >
                    <DialogTitle className="sr-only">
                        {lightbox ? `${lightbox.label} full size` : 'Full size cover view'}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Full-size preview of the selected cover image.
                    </DialogDescription>
                    <div className="relative w-full h-full flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
                        {lightbox && (
                            <img
                                src={lightbox.url}
                                alt={lightbox.label}
                                className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                onClick={(event) => event.stopPropagation()}
                            />
                        )}
                        <button
                            type="button"
                            className="absolute top-6 right-6 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50 pointer-events-auto cursor-pointer"
                            onClick={(event) => {
                                event.stopPropagation()
                                setLightbox(null)
                            }}
                        >
                            <span className="sr-only">Close</span>
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={downloadOptionsOpen} onOpenChange={setDownloadOptionsOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Download cover files</DialogTitle>
                    </DialogHeader>

                    <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={includeLineArtInDownload}
                            onChange={(event) => setIncludeLineArtInDownload(event.target.checked)}
                            className="mt-0.5"
                        />
                        <span>Include front cover line art</span>
                    </label>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDownloadOptionsOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleDownload}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
