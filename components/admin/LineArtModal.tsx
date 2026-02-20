'use client'

import { useState, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Pencil, Upload, Download, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

type FileStatus = 'pending' | 'generating' | 'done' | 'error'

interface FileEntry {
    file: File
    status: FileStatus
    error?: string
    resultBase64?: string
}

const MAX_CONCURRENT = 3

export function LineArtModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const [files, setFiles] = useState<FileEntry[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const cancelledRef = useRef(false)

    const reset = useCallback(() => {
        setFiles([])
        setIsProcessing(false)
        cancelledRef.current = false
    }, [])

    const handleClose = useCallback(() => {
        if (isProcessing) {
            const confirmed = window.confirm('Generation is in progress. Cancel and close?')
            if (!confirmed) return
            cancelledRef.current = true
        }
        reset()
        onOpenChange(false)
    }, [isProcessing, onOpenChange, reset])

    const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
        if (!selectedFiles || selectedFiles.length === 0) return
        const entries: FileEntry[] = Array.from(selectedFiles)
            .filter(f => f.type.startsWith('image/'))
            .map(f => ({ file: f, status: 'pending' as FileStatus }))
        setFiles(entries)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        handleFileSelect(e.dataTransfer.files)
    }, [handleFileSelect])

    const generateLineArt = useCallback(async (entry: FileEntry, index: number): Promise<void> => {
        if (cancelledRef.current) return

        setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'generating' } : f))

        try {
            const formData = new FormData()
            formData.append('file', entry.file)

            const response = await fetch('/api/line-art', { method: 'POST', body: formData })
            const result = await response.json()

            if (cancelledRef.current) return

            if (!response.ok || !result.success) {
                setFiles(prev => prev.map((f, i) => i === index
                    ? { ...f, status: 'error', error: result.error || 'Generation failed' }
                    : f
                ))
                return
            }

            setFiles(prev => prev.map((f, i) => i === index
                ? { ...f, status: 'done', resultBase64: result.imageBase64 }
                : f
            ))
        } catch (err) {
            if (cancelledRef.current) return
            setFiles(prev => prev.map((f, i) => i === index
                ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
                : f
            ))
        }
    }, [])

    const startGeneration = useCallback(async () => {
        if (files.length === 0) return
        setIsProcessing(true)
        cancelledRef.current = false

        let nextIndex = 0
        const activePromises: Promise<void>[] = []

        async function processNext(): Promise<void> {
            while (nextIndex < files.length && !cancelledRef.current) {
                const idx = nextIndex++
                await generateLineArt(files[idx], idx)
            }
        }

        for (let i = 0; i < Math.min(MAX_CONCURRENT, files.length); i++) {
            activePromises.push(processNext())
        }

        await Promise.all(activePromises)
        setIsProcessing(false)
    }, [files, generateLineArt])

    const downloadOne = useCallback((base64: string, index: number) => {
        const link = document.createElement('a')
        link.href = `data:image/png;base64,${base64}`
        link.download = `LineArt${index + 1}.png`
        link.click()
    }, [])

    const downloadAll = useCallback(() => {
        files.forEach((f, i) => {
            if (f.resultBase64) {
                setTimeout(() => downloadOne(f.resultBase64!, i), i * 200)
            }
        })
    }, [files, downloadOne])

    const completedCount = files.filter(f => f.status === 'done').length
    const failedCount = files.filter(f => f.status === 'error').length
    const totalCount = files.length
    const hasResults = completedCount > 0
    const allDone = !isProcessing && totalCount > 0 && (completedCount + failedCount) === totalCount

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="w-5 h-5" />
                        Line Art Generator
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4">
                    {/* File picker area */}
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

                    {/* Progress bar */}
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

                    {/* File list */}
                    {files.length > 0 && (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {files.map((entry, i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 text-sm">
                                    <span className="flex-shrink-0">
                                        {entry.status === 'pending' && <span className="w-4 h-4 block rounded-full bg-gray-300" />}
                                        {entry.status === 'generating' && <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />}
                                        {entry.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        {entry.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                    </span>
                                    <span className="flex-1 truncate text-gray-700">
                                        {entry.file.name}
                                    </span>
                                    <span className="flex-shrink-0 text-xs text-gray-400 w-20 text-right">
                                        → LineArt{i + 1}.png
                                    </span>
                                    {entry.status === 'done' && entry.resultBase64 && (
                                        <button
                                            onClick={() => downloadOne(entry.resultBase64!, i)}
                                            className="flex-shrink-0 text-gray-500 hover:text-gray-800"
                                            title="Download"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error details */}
                    {files.some(f => f.error) && (
                        <div className="text-xs text-red-500 space-y-1">
                            {files.filter(f => f.error).map((f, i) => (
                                <p key={i} className="truncate">{f.file.name}: {f.error}</p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
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
                        <Button variant="outline" onClick={() => { cancelledRef.current = true }} className="flex-1">
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
    )
}
