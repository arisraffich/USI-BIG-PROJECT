'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Check, Download, ImagePlus, Loader2, PencilRuler, RotateCw, Upload, X } from 'lucide-react'
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
    const [isProcessing, setIsProcessing] = useState(false)
    const [lightbox, setLightbox] = useState<LightboxImage | null>(null)

    const queuedCount = items.filter(item => item.status === 'queued').length
    const readyItems = useMemo(
        () => items.filter(item => item.status === 'ready' && item.resultDataUrl),
        [items]
    )
    const readyCount = readyItems.length
    const failedCount = items.filter(item => item.status === 'failed').length
    const canUploadMore = items.length < MAX_FILES && !isProcessing
    const canCreate = queuedCount > 0 && !isProcessing

    const updateItem = useCallback((id: string, patch: Partial<SketchItem>) => {
        setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
    }, [])

    const reset = useCallback(() => {
        setItems(current => {
            current.forEach(item => URL.revokeObjectURL(item.previewUrl))
            return []
        })
        setModel('nb2')
        setIsProcessing(false)
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
        }
    }, [model, updateItem])

    const processItems = useCallback(async (targetItems: SketchItem[]) => {
        if (targetItems.length === 0) return
        setIsProcessing(true)
        let index = 0
        const workerCount = Math.min(MAX_CONCURRENT, targetItems.length)

        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (index < targetItems.length) {
                const item = targetItems[index]
                index += 1
                await createOne(item)
            }
        }))

        setIsProcessing(false)
    }, [createOne])

    const handleCreateSketches = useCallback(() => {
        processItems(items.filter(item => item.status === 'queued'))
    }, [items, processItems])

    const handleRetryFailed = useCallback(() => {
        processItems(items.filter(item => item.status === 'failed'))
    }, [items, processItems])

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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {items.map(item => {
                                const imageUrl = item.resultDataUrl || item.previewUrl
                                const imageLabel = item.resultDataUrl ? `${item.file.name} sketch preview` : item.file.name

                                return (
                                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                        <div className="relative h-44 bg-slate-50 flex items-center justify-center">
                                            {item.resultDataUrl ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setLightbox({ url: item.resultDataUrl!, label: imageLabel })}
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
                                        </div>
                                        <div className="p-3 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-800 truncate" title={item.file.name}>{item.file.name}</p>
                                                    <p className="text-xs text-slate-500">{sketchFileName(item.file.name)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(item.id)}
                                                    disabled={isProcessing}
                                                    className="text-slate-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                                                    title="Remove"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs font-medium">
                                                {item.status === 'queued' && <span className="text-slate-500 flex items-center gap-1"><ImagePlus className="w-3.5 h-3.5" /> Queued</span>}
                                                {item.status === 'processing' && <span className="text-slate-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating</span>}
                                                {item.status === 'ready' && <span className="text-green-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Ready</span>}
                                                {item.status === 'failed' && <span className="text-red-600">Failed</span>}
                                            </div>
                                            {item.error && <p className="text-xs text-red-600 line-clamp-2">{item.error}</p>}
                                        </div>
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
                        {failedCount > 0 && !isProcessing && (
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
                            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PencilRuler className="w-4 h-4 mr-2" />}
                            {isProcessing ? 'Creating...' : 'Create Sketch'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={!!lightbox} onOpenChange={(open) => { if (!open) setLightbox(null) }}>
            <DialogContent
                showCloseButton={false}
                className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
            >
                <DialogTitle className="sr-only">{lightbox?.label || 'Sketch preview'}</DialogTitle>
                <DialogDescription className="sr-only">
                    View the generated sketch preview at full size.
                </DialogDescription>
                <div className="relative w-full h-full flex items-center justify-center p-4 bg-black/80" onClick={() => setLightbox(null)}>
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
