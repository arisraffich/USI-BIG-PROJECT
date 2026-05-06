'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Pencil, Upload, Download, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

type FileStatus = 'pending' | 'generating' | 'done' | 'error'

interface FileEntry {
    file: File
    status: FileStatus
    error?: string
    previewUrl?: string
    blobUrl?: string
}

interface LightboxImage {
    url: string
    label: string
    fileIndex?: number
}

interface LightboxState {
    items: LightboxImage[]
    index: number
}

const MAX_CONCURRENT = 3

function revokeEntryUrls(entry: FileEntry) {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
    if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl)
}

export function LineArtModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const [files, setFiles] = useState<FileEntry[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [lightbox, setLightbox] = useState<LightboxState | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    const reset = useCallback(() => {
        // Revoke any object URLs to prevent memory leaks
        setFiles(prev => {
            prev.forEach(revokeEntryUrls)
            return []
        })
        setIsProcessing(false)
        abortControllerRef.current = null
    }, [])

    const handleClose = useCallback(() => {
        if (isProcessing) {
            const confirmed = window.confirm('Generation is in progress. Cancel and close?')
            if (!confirmed) return
            abortControllerRef.current?.abort()
        }
        reset()
        onOpenChange(false)
    }, [isProcessing, onOpenChange, reset])

    const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
        if (!selectedFiles || selectedFiles.length === 0) return
        const entries: FileEntry[] = Array.from(selectedFiles)
            .filter(f => f.type.startsWith('image/'))
            .map(f => ({ file: f, status: 'pending' as FileStatus, previewUrl: URL.createObjectURL(f) }))
        setFiles(prev => {
            prev.forEach(revokeEntryUrls)
            return entries
        })
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        handleFileSelect(e.dataTransfer.files)
    }, [handleFileSelect])

    const generateLineArt = useCallback(async (entry: FileEntry, index: number, signal: AbortSignal): Promise<void> => {
        if (signal.aborted) return

        setFiles(prev => prev.map((f, i) => {
            if (i !== index) return f
            if (f.blobUrl) URL.revokeObjectURL(f.blobUrl)
            return { ...f, status: 'generating', error: undefined, blobUrl: undefined }
        }))

        try {
            const formData = new FormData()
            formData.append('file', entry.file)

            const response = await fetch('/api/line-art', { method: 'POST', body: formData, signal })

            if (signal.aborted) return

            if (!response.ok) {
                let errorMsg = 'Generation failed'
                try {
                    const errData = await response.json()
                    errorMsg = errData.error || errorMsg
                } catch { /* binary error response */ }
                setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: errorMsg } : f))
                return
            }

            const blob = await response.blob()
            if (signal.aborted) return

            const blobUrl = URL.createObjectURL(blob)
            setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'done', blobUrl } : f))
        } catch (err) {
            if (signal.aborted) return
            const msg = err instanceof Error ? err.message : 'Unknown error'
            if (msg.includes('abort')) return
            setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: msg } : f))
        }
    }, [])

    const startGeneration = useCallback(async () => {
        if (files.length === 0) return
        setIsProcessing(true)

        const controller = new AbortController()
        abortControllerRef.current = controller

        let nextIndex = 0
        const activePromises: Promise<void>[] = []

        async function processNext(): Promise<void> {
            while (nextIndex < files.length && !controller.signal.aborted) {
                const idx = nextIndex++
                await generateLineArt(files[idx], idx, controller.signal)
            }
        }

        for (let i = 0; i < Math.min(MAX_CONCURRENT, files.length); i++) {
            activePromises.push(processNext())
        }

        await Promise.all(activePromises)
        setIsProcessing(false)
    }, [files, generateLineArt])

    const regenerateOne = useCallback(async (index: number) => {
        const entry = files[index]
        if (!entry || isProcessing) return

        setIsProcessing(true)
        const controller = new AbortController()
        abortControllerRef.current = controller

        await generateLineArt(entry, index, controller.signal)

        if (abortControllerRef.current === controller) {
            abortControllerRef.current = null
        }
        setIsProcessing(false)
    }, [files, generateLineArt, isProcessing])

    const downloadOne = useCallback((blobUrl: string, index: number) => {
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `LineArt${index + 1}.png`
        link.click()
    }, [])

    const downloadAll = useCallback(() => {
        files.forEach((f, i) => {
            if (f.blobUrl) {
                setTimeout(() => downloadOne(f.blobUrl!, i), i * 200)
            }
        })
    }, [files, downloadOne])

    const openGeneratedPreview = useCallback((fileIndex: number) => {
        const items: LightboxImage[] = []
        files.forEach((entry, index) => {
            if (entry.status === 'done' && entry.blobUrl) {
                items.push({ url: entry.blobUrl, label: `${entry.file.name} line art preview`, fileIndex: index })
            }
        })

        if (items.length === 0) return

        setLightbox({
            items,
            index: Math.max(0, items.findIndex(item => item.fileIndex === fileIndex)),
        })
    }, [files])

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

    const completedCount = files.filter(f => f.status === 'done').length
    const failedCount = files.filter(f => f.status === 'error').length
    const totalCount = files.length
    const hasResults = completedCount > 0
    const allDone = !isProcessing && totalCount > 0 && (completedCount + failedCount) === totalCount
    const currentLightboxImage = lightbox?.items[lightbox.index] || null
    const canNavigateLightbox = Boolean(lightbox && lightbox.items.length > 1)

    return (
        <>
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="w-5 h-5" />
                        Line Art Generator
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Upload colored illustrations, generate line art versions, and download the finished files.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4">
                    {files.length === 0 && (
                        <div
                            onDrop={handleDrop}
                            onDragOver={e => e.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
                        >
                            <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                            <p className="text-sm font-medium text-gray-700">Drop colored illustrations here</p>
                            <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={e => handleFileSelect(e.target.files)}
                            />
                        </div>
                    )}

                    {totalCount > 0 && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>{completedCount + failedCount} / {totalCount} processed</span>
                                {failedCount > 0 && <span className="text-red-500">{failedCount} failed</span>}
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gray-800 transition-all duration-300 rounded-full"
                                    style={{ width: `${((completedCount + failedCount) / totalCount) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {files.length > 0 && (
                        <div className="grid max-h-72 grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-4">
                            {files.map((entry, i) => {
                                const thumbnailUrl = entry.status === 'done' && entry.blobUrl ? entry.blobUrl : entry.previewUrl
                                const thumbnailLabel = entry.status === 'done'
                                    ? `${entry.file.name} line art preview`
                                    : `${entry.file.name} source preview`

                                return (
                                    <div
                                        key={i}
                                        className={`rounded-lg border bg-gray-50 p-2 ${
                                            entry.status === 'done'
                                                ? 'border-green-200'
                                                : entry.status === 'error'
                                                    ? 'border-red-200'
                                                    : 'border-gray-200'
                                        }`}
                                    >
                                        <div className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-white">
                                            {thumbnailUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (entry.status === 'done' && entry.blobUrl) {
                                                            openGeneratedPreview(i)
                                                        } else {
                                                            setLightbox({ items: [{ url: thumbnailUrl, label: thumbnailLabel }], index: 0 })
                                                        }
                                                    }}
                                                    className="flex h-full w-full cursor-zoom-in items-center justify-center bg-white bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0] p-1"
                                                    title="Open full preview"
                                                >
                                                    <img src={thumbnailUrl} alt={thumbnailLabel} className="max-h-full max-w-full object-contain" />
                                                </button>
                                            )}
                                            {entry.status === 'generating' && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white/55">
                                                    <Loader2 className="w-5 h-5 text-gray-700 animate-spin" />
                                                </div>
                                            )}
                                            {entry.status === 'error' && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-red-50/80">
                                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                                </div>
                                            )}
                                            {entry.status === 'done' && (
                                                <CheckCircle2 className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-white text-green-500" />
                                            )}
                                        </div>
                                        {entry.status === 'done' && entry.blobUrl && (
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => regenerateOne(i)}
                                                    disabled={isProcessing}
                                                    className="flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                                                    title="Regenerate"
                                                    aria-label={`Regenerate line art ${i + 1}`}
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => downloadOne(entry.blobUrl!, i)}
                                                    className="flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                                                    title="Download"
                                                    aria-label={`Download line art ${i + 1}`}
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {files.some(f => f.error) && (
                        <div className="text-xs text-red-500 space-y-1">
                            {files.filter(f => f.error).map((f, i) => (
                                <p key={i} className="truncate">{f.file.name}: {f.error}</p>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                    {files.length === 0 ? (
                        <Button variant="outline" className="flex-1" onClick={handleClose}>
                            Cancel
                        </Button>
                    ) : !isProcessing && !allDone ? (
                        <>
                            <Button variant="outline" onClick={reset} className="flex-shrink-0">
                                <X className="w-4 h-4 mr-1" /> Clear
                            </Button>
                            <Button onClick={startGeneration} className="flex-1">
                                <Pencil className="w-4 h-4 mr-2" />
                                Generate {totalCount} Line Art{totalCount > 1 ? 's' : ''}
                            </Button>
                        </>
                    ) : isProcessing ? (
                        <Button
                            variant="outline"
                            onClick={() => abortControllerRef.current?.abort()}
                            className="flex-1"
                        >
                            Cancel Generation
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={reset} className="flex-shrink-0">
                                New Batch
                            </Button>
                            {hasResults && (
                                <Button onClick={downloadAll} className="flex-1">
                                    <Download className="w-4 h-4 mr-2" />
                                    Download All ({completedCount})
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={!!currentLightboxImage} onOpenChange={(open) => { if (!open) setLightbox(null) }}>
            <DialogContent
                showCloseButton={false}
                className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
            >
                <DialogTitle className="sr-only">{currentLightboxImage?.label || 'Line art preview'}</DialogTitle>
                <DialogDescription className="sr-only">
                    View the generated line art preview at full size.
                </DialogDescription>
                <div className="relative w-full h-full flex items-center justify-center p-4 bg-black/80" onClick={() => setLightbox(null)}>
                    {currentLightboxImage && (
                        <div
                            className="max-w-full max-h-full rounded-md bg-white bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-4 shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <img
                                src={currentLightboxImage.url}
                                alt={currentLightboxImage.label}
                                className="max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] object-contain"
                            />
                        </div>
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
                                aria-label="View previous line art"
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
                                aria-label="View next line art"
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
