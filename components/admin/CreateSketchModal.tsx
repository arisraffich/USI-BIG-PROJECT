'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Check, ChevronLeft, ChevronRight, Download, Loader2, PencilRuler, RotateCw, Upload, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CreateSketchModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

type SketchModel = 'nb2' | 'nb-pro' | 'gpt-2'
type SketchStatus = 'queued' | 'processing' | 'ready' | 'failed'

interface SketchItem {
    id: string
    file: File
    previewUrl: string
    status: SketchStatus
    error: string | null
    resultDataUrl: string | null
}

interface LightboxImage {
    url: string
    label: string
    itemId?: string
}

interface LightboxState {
    items: LightboxImage[]
    index: number
}

const MAX_FILES = 5
const MAX_CONCURRENT = 2

function createId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function slugifyFileName(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, '')
    return (base
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase() || 'image')
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
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

function sketchFileName(fileName: string): string {
    return `${slugifyFileName(fileName)}-sketch.jpg`
}

async function zipAndDownload(files: Array<{ name: string, dataUrl: string }>) {
    const zip = new JSZip()
    for (const file of files) {
        zip.file(file.name, dataUrlToBlob(file.dataUrl))
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, 'sketches.zip')
}

export function CreateSketchModal({ open, onOpenChange }: CreateSketchModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [items, setItems] = useState<SketchItem[]>([])
    const [model, setModel] = useState<SketchModel>('nb2')
    const [activeRequestCount, setActiveRequestCount] = useState(0)
    const [lightbox, setLightbox] = useState<LightboxState | null>(null)

    const isProcessing = activeRequestCount > 0
    const queuedCount = items.filter(item => item.status === 'queued').length
    const readyItems = useMemo(
        () => items.filter(item => item.status === 'ready' && item.resultDataUrl),
        [items]
    )
    const readyCount = readyItems.length
    const failedCount = items.filter(item => item.status === 'failed').length
    const canUploadMore = items.length < MAX_FILES && !isProcessing
    const canStartAnotherRequest = activeRequestCount < MAX_CONCURRENT
    const canCreate = queuedCount > 0 && canStartAnotherRequest
    const currentLightboxImage = lightbox?.items[lightbox.index] || null
    const canNavigateLightbox = Boolean(lightbox && lightbox.items.length > 1)

    const updateItem = useCallback((id: string, patch: Partial<SketchItem>) => {
        setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
    }, [])

    const reset = useCallback(() => {
        setItems(current => {
            current.forEach(item => URL.revokeObjectURL(item.previewUrl))
            return []
        })
        setModel('nb2')
        setActiveRequestCount(0)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        if (!nextOpen && isProcessing) return
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }, [isProcessing, onOpenChange, reset])

    const addFiles = useCallback((fileList: FileList | File[]) => {
        if (!canUploadMore) return
        const openSlots = MAX_FILES - items.length
        const imageFiles = Array.from(fileList)
            .filter(file => file.type.startsWith('image/'))
            .slice(0, openSlots)

        if (imageFiles.length === 0) return

        const nextItems = imageFiles.map(file => ({
            id: createId(),
            file,
            previewUrl: URL.createObjectURL(file),
            status: 'queued' as SketchStatus,
            error: null,
            resultDataUrl: null,
        }))

        setItems(current => [...current, ...nextItems].slice(0, MAX_FILES))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [canUploadMore, items.length])

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        addFiles(event.dataTransfer.files)
    }, [addFiles])

    const removeItem = useCallback((id: string) => {
        setItems(current => {
            const item = current.find(i => i.id === id)
            if (item) URL.revokeObjectURL(item.previewUrl)
            return current.filter(i => i.id !== id)
        })
    }, [])

    const createOne = useCallback(async (item: SketchItem): Promise<void> => {
        setActiveRequestCount(count => count + 1)
        updateItem(item.id, { status: 'processing', error: null, resultDataUrl: null })

        try {
            const formData = new FormData()
            formData.append('file', item.file)
            formData.append('model', model)

            const response = await fetch('/api/tools/sketch', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const body = await response.json().catch(() => ({} as { error?: string }))
                throw new Error(body.error || 'Sketch generation failed')
            }

            const data = await response.json() as { image: { dataUrl: string } }
            updateItem(item.id, { status: 'ready', resultDataUrl: data.image.dataUrl, error: null })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Sketch generation failed'
            updateItem(item.id, { status: 'failed', error: message })
        } finally {
            setActiveRequestCount(count => Math.max(0, count - 1))
        }
    }, [model, updateItem])

    const processItems = useCallback(async (targetItems: SketchItem[]) => {
        if (targetItems.length === 0) return
        const availableSlots = Math.max(0, MAX_CONCURRENT - activeRequestCount)
        if (availableSlots === 0) return

        let index = 0
        const workerCount = Math.min(availableSlots, targetItems.length)

        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (index < targetItems.length) {
                const item = targetItems[index]
                index += 1
                await createOne(item)
            }
        }))
    }, [activeRequestCount, createOne])

    const handleCreateSketches = useCallback(() => {
        processItems(items.filter(item => item.status === 'queued'))
    }, [items, processItems])

    const handleRetryFailed = useCallback(() => {
        processItems(items.filter(item => item.status === 'failed'))
    }, [items, processItems])

    const handleRegenerateOne = useCallback(async (item: SketchItem) => {
        if (item.status === 'processing' || activeRequestCount >= MAX_CONCURRENT) return
        await createOne(item)
    }, [activeRequestCount, createOne])

    const handleDownloadOne = useCallback((item: SketchItem) => {
        if (!item.resultDataUrl) return
        downloadBlob(dataUrlToBlob(item.resultDataUrl), sketchFileName(item.file.name))
    }, [])

    const handleDownload = useCallback(async () => {
        const files = readyItems.map(item => ({
            name: sketchFileName(item.file.name),
            dataUrl: item.resultDataUrl!,
        }))

        if (files.length === 0) return
        if (files.length === 1) {
            downloadBlob(dataUrlToBlob(files[0].dataUrl), files[0].name)
            return
        }

        await zipAndDownload(files)
    }, [readyItems])

    const openGeneratedPreview = useCallback((itemId: string) => {
        const lightboxItems = items
            .filter(item => item.status === 'ready' && item.resultDataUrl)
            .map(item => ({
                url: item.resultDataUrl!,
                label: `${item.file.name} sketch preview`,
                itemId: item.id,
            }))

        if (lightboxItems.length === 0) return

        setLightbox({
            items: lightboxItems,
            index: Math.max(0, lightboxItems.findIndex(item => item.itemId === itemId)),
        })
    }, [items])

    const showPreviousLightboxImage = useCallback(() => {
        setLightbox(prev => {
            if (!prev || prev.items.length <= 1) return prev
            return { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length }
        })
    }, [])

    const showNextLightboxImage = useCallback(() => {
        setLightbox(prev => {
            if (!prev || prev.items.length <= 1) return prev
            return { ...prev, index: (prev.index + 1) % prev.items.length }
        })
    }, [])

    useEffect(() => {
        if (!lightbox || lightbox.items.length <= 1) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault()
                showPreviousLightboxImage()
            } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                showNextLightboxImage()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [lightbox, showNextLightboxImage, showPreviousLightboxImage])

    const statusText = useMemo(() => {
        if (items.length === 0) return `Upload up to ${MAX_FILES} images.`
        if (isProcessing) return `Creating sketches ${MAX_CONCURRENT} images at a time...`
        return `${readyCount}/${items.length} ready${failedCount ? `, ${failedCount} failed` : ''}`
    }, [failedCount, isProcessing, items.length, readyCount])

    return (
        <>
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="sm:max-w-3xl max-h-[90vh] flex flex-col"
                onPointerDownOutside={(event) => { if (isProcessing) event.preventDefault() }}
                onEscapeKeyDown={(event) => { if (isProcessing) event.preventDefault() }}
            >
                <DialogHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-8">
                        <DialogTitle className="flex items-center gap-2">
                            <PencilRuler className="w-5 h-5 text-slate-700" />
                            Create Sketch
                        </DialogTitle>
                        <Select value={model} onValueChange={(value) => setModel(value as SketchModel)} disabled={isProcessing}>
                            <SelectTrigger className="w-full sm:w-[190px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="nb2">Nano Banana 2</SelectItem>
                                <SelectItem value="nb-pro">Nano Banana Pro</SelectItem>
                                <SelectItem value="gpt-2">GPT 2</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogDescription className="sr-only">
                        Upload images, choose a model, create pencil sketch versions, preview the results, and download JPG files.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {canUploadMore && (
                        <div
                            onDrop={handleDrop}
                            onDragOver={(event) => event.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-300 rounded-lg min-h-[150px] flex items-center justify-center text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors bg-white"
                        >
                            <div className="p-7">
                                <Upload className="w-9 h-9 mx-auto mb-2 text-slate-400" />
                                <p className="text-sm font-medium text-slate-700">Upload images</p>
                                <p className="text-xs text-slate-500 mt-1">Drop up to {MAX_FILES} images or click to browse</p>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(event) => event.target.files && addFiles(event.target.files)}
                            />
                        </div>
                    )}

                    {items.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {items.map(item => {
                                const imageUrl = item.resultDataUrl || item.previewUrl
                                const imageLabel = item.resultDataUrl ? `${item.file.name} sketch preview` : item.file.name
                                const isReady = item.status === 'ready' && item.resultDataUrl

                                return (
                                    <div
                                        key={item.id}
                                        className={`rounded-lg border bg-slate-50 p-2 ${
                                            item.status === 'failed' ? 'border-red-200' : 'border-slate-200'
                                        }`}
                                        title={item.error || imageLabel}
                                    >
                                        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-white">
                                            {item.resultDataUrl ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openGeneratedPreview(item.id)}
                                                    className="flex h-full w-full cursor-zoom-in items-center justify-center"
                                                    title="Open full preview"
                                                >
                                                    <img src={imageUrl} alt={imageLabel} className="max-w-full max-h-full object-contain" />
                                                </button>
                                            ) : (
                                                <img src={imageUrl} alt={imageLabel} className="max-w-full max-h-full object-contain" />
                                            )}
                                            {item.status === 'processing' && (
                                                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                                                    <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
                                                </div>
                                            )}
                                            {item.status === 'ready' && (
                                                <div className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-green-600 shadow-sm">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.id)}
                                                disabled={item.status === 'processing'}
                                                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-sm hover:bg-white hover:text-red-500 disabled:opacity-40"
                                                title="Remove"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        {isReady && (
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRegenerateOne(item)}
                                                    disabled={item.status === 'processing' || activeRequestCount >= MAX_CONCURRENT}
                                                    className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                                    title="Regenerate"
                                                    aria-label={`Regenerate sketch for ${item.file.name}`}
                                                >
                                                    <RotateCw className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDownloadOne(item)}
                                                    className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                                    title="Download"
                                                    aria-label={`Download sketch for ${item.file.name}`}
                                                >
                                                    <Download className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-xs text-slate-500">
                        {statusText}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {failedCount > 0 && canStartAnotherRequest && (
                            <Button variant="outline" onClick={handleRetryFailed}>
                                <RotateCw className="w-4 h-4 mr-2" />
                                Retry Failed
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isProcessing}>
                            Cancel
                        </Button>
                        {readyCount > 0 && !isProcessing && (
                            <Button variant="outline" onClick={handleDownload}>
                                <Download className="w-4 h-4 mr-2" />
                                {readyCount === 1 ? 'Download JPG' : `Download ZIP (${readyCount})`}
                            </Button>
                        )}
                        <Button onClick={handleCreateSketches} disabled={!canCreate} className="bg-slate-900 hover:bg-slate-800 text-white">
                            {isProcessing && !canCreate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PencilRuler className="w-4 h-4 mr-2" />}
                            {isProcessing && !canCreate ? 'Creating...' : 'Create Sketch'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={!!currentLightboxImage} onOpenChange={(open) => { if (!open) setLightbox(null) }}>
            <DialogContent
                showCloseButton={false}
                className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
            >
                <DialogTitle className="sr-only">{currentLightboxImage?.label || 'Sketch preview'}</DialogTitle>
                <DialogDescription className="sr-only">
                    View the generated sketch preview at full size.
                </DialogDescription>
                <div className="relative w-full h-full flex items-center justify-center p-4 bg-black/80" onClick={() => setLightbox(null)}>
                    {currentLightboxImage && (
                        <img
                            src={currentLightboxImage.url}
                            alt={currentLightboxImage.label}
                            className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        />
                    )}
                    {canNavigateLightbox && (
                        <>
                            <button
                                type="button"
                                className="absolute left-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/70 hover:text-white/90"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    showPreviousLightboxImage()
                                }}
                                aria-label="View previous sketch"
                            >
                                <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                className="absolute right-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/70 hover:text-white/90"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    showNextLightboxImage()
                                }}
                                aria-label="View next sketch"
                            >
                                <ChevronRight className="w-7 h-7" strokeWidth={2.5} />
                            </button>
                            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white">
                                {lightbox ? `${lightbox.index + 1} / ${lightbox.items.length}` : ''}
                            </div>
                        </>
                    )}
                    <button
                        type="button"
                        className="absolute top-4 right-4 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50"
                        onClick={(event) => {
                            event.stopPropagation()
                            setLightbox(null)
                        }}
                        aria-label="Close full preview"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </DialogContent>
        </Dialog>
        </>
    )
}
