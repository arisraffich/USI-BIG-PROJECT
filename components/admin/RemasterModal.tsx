'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Check, Download, Loader2, RotateCw, Sparkles, Upload, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RemasterModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

type RemasterModel = 'nb2' | 'nb-pro' | 'gpt-2'
type RemasterStatus = 'queued' | 'processing' | 'ready' | 'failed'

interface RemasterItem {
    id: string
    file: File
    previewUrl: string
    width: number
    height: number
    ratioLabel: string
    status: RemasterStatus
    error: string | null
    resultDataUrl: string | null
}

const RATIO_OPTIONS = [
    { label: '1:1', value: 1 },
    { label: '2:3', value: 2 / 3 },
    { label: '3:2', value: 3 / 2 },
    { label: '3:4', value: 3 / 4 },
    { label: '4:3', value: 4 / 3 },
    { label: '4:5', value: 4 / 5 },
    { label: '5:4', value: 5 / 4 },
    { label: '9:16', value: 9 / 16 },
    { label: '16:9', value: 16 / 9 },
    { label: '21:9', value: 21 / 9 },
]

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

function closestRatioLabel(width: number, height: number): string {
    const ratio = width / height
    let best = RATIO_OPTIONS[0]
    let bestDistance = Math.abs(Math.log(ratio / best.value))

    for (const option of RATIO_OPTIONS.slice(1)) {
        const distance = Math.abs(Math.log(ratio / option.value))
        if (distance < bestDistance) {
            best = option
            bestDistance = distance
        }
    }

    return `Detected: ${best.label}`
}

function readImageDimensions(file: File): Promise<{ previewUrl: string, width: number, height: number, ratioLabel: string }> {
    return new Promise((resolve, reject) => {
        const previewUrl = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => resolve({
            previewUrl,
            width: img.naturalWidth || 1,
            height: img.naturalHeight || 1,
            ratioLabel: closestRatioLabel(img.naturalWidth || 1, img.naturalHeight || 1),
        })
        img.onerror = () => {
            URL.revokeObjectURL(previewUrl)
            reject(new Error('Could not read image'))
        }
        img.src = previewUrl
    })
}

async function zipAndDownload(files: Array<{ name: string, dataUrl: string }>) {
    const zip = new JSZip()
    for (const file of files) {
        zip.file(file.name, dataUrlToBlob(file.dataUrl))
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, 'remastered-images.zip')
}

export function RemasterModal({ open, onOpenChange }: RemasterModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [items, setItems] = useState<RemasterItem[]>([])
    const [model, setModel] = useState<RemasterModel>('nb2')
    const [isRemastering, setIsRemastering] = useState(false)

    const hasImages = items.length > 0
    const failedCount = items.filter(item => item.status === 'failed').length
    const readyCount = items.filter(item => item.status === 'ready').length
    const canRemaster = hasImages && !isRemastering

    const updateItem = useCallback((id: string, patch: Partial<RemasterItem>) => {
        setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
    }, [])

    const reset = useCallback(() => {
        setItems(current => {
            current.forEach(item => URL.revokeObjectURL(item.previewUrl))
            return []
        })
        setModel('nb2')
        setIsRemastering(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        if (!nextOpen && isRemastering) {
            const confirmed = window.confirm('Remastering is in progress. Close anyway?')
            if (!confirmed) return
        }
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }, [isRemastering, onOpenChange, reset])

    const addFiles = useCallback(async (fileList: FileList | File[]) => {
        const imageFiles = Array.from(fileList).filter(file => file.type.startsWith('image/'))
        if (imageFiles.length === 0) return

        const nextItems: RemasterItem[] = []
        for (const file of imageFiles) {
            try {
                const info = await readImageDimensions(file)
                nextItems.push({
                    id: createId(),
                    file,
                    previewUrl: info.previewUrl,
                    width: info.width,
                    height: info.height,
                    ratioLabel: info.ratioLabel,
                    status: 'queued',
                    error: null,
                    resultDataUrl: null,
                })
            } catch (error) {
                console.error('Failed to prepare remaster file:', error)
            }
        }

        setItems(current => [...current, ...nextItems])
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (!isRemastering) addFiles(event.dataTransfer.files)
    }, [addFiles, isRemastering])

    const removeItem = useCallback((id: string) => {
        setItems(current => {
            const item = current.find(i => i.id === id)
            if (item) URL.revokeObjectURL(item.previewUrl)
            return current.filter(i => i.id !== id)
        })
    }, [])

    const remasterOne = useCallback(async (item: RemasterItem): Promise<{ name: string, dataUrl: string } | null> => {
        updateItem(item.id, { status: 'processing', error: null, resultDataUrl: null })

        try {
            const formData = new FormData()
            formData.append('file', item.file)
            formData.append('model', model)

            const response = await fetch('/api/tools/remaster', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const body = await response.json().catch(() => ({} as { error?: string }))
                throw new Error(body.error || 'Remaster failed')
            }

            const data = await response.json() as { image: { dataUrl: string } }
            const name = `${slugifyFileName(item.file.name)}-remastered.png`
            updateItem(item.id, { status: 'ready', resultDataUrl: data.image.dataUrl, error: null })
            return { name, dataUrl: data.image.dataUrl }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Remaster failed'
            updateItem(item.id, { status: 'failed', error: message })
            return null
        }
    }, [model, updateItem])

    const processItems = useCallback(async (targetItems: RemasterItem[]) => {
        if (targetItems.length === 0) return
        setIsRemastering(true)
        const successes: Array<{ name: string, dataUrl: string }> = []
        let index = 0
        const workerCount = Math.min(3, targetItems.length)

        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (index < targetItems.length) {
                const item = targetItems[index]
                index += 1
                const result = await remasterOne(item)
                if (result) successes.push(result)
            }
        }))

        if (successes.length > 0) {
            await zipAndDownload(successes)
        }

        setIsRemastering(false)
    }, [remasterOne])

    const handleRemasterAll = useCallback(() => {
        const targets = items.filter(item => item.status !== 'processing')
        processItems(targets)
    }, [items, processItems])

    const handleRetryFailed = useCallback(() => {
        const targets = items.filter(item => item.status === 'failed')
        processItems(targets)
    }, [items, processItems])

    const statusText = useMemo(() => {
        if (!hasImages) return 'Upload images to remaster.'
        if (isRemastering) return 'Remastering 3 images at a time...'
        return `${readyCount}/${items.length} ready${failedCount ? `, ${failedCount} failed` : ''}`
    }, [failedCount, hasImages, isRemastering, items.length, readyCount])

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="sm:max-w-3xl max-h-[90vh] flex flex-col"
                onPointerDownOutside={(event) => { if (isRemastering) event.preventDefault() }}
                onEscapeKeyDown={(event) => { if (isRemastering) event.preventDefault() }}
            >
                <DialogHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-8">
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-purple-600" />
                            Remaster
                        </DialogTitle>
                        <Select value={model} onValueChange={(value) => setModel(value as RemasterModel)} disabled={isRemastering}>
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
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <div
                        onDrop={handleDrop}
                        onDragOver={(event) => event.preventDefault()}
                        onClick={() => !isRemastering && fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 rounded-lg min-h-[150px] flex items-center justify-center text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/40 transition-colors bg-white"
                    >
                        <div className="p-7">
                            <Upload className="w-9 h-9 mx-auto mb-2 text-slate-400" />
                            <p className="text-sm font-medium text-slate-700">Upload images</p>
                            <p className="text-xs text-slate-500 mt-1">Drop multiple images or click to browse</p>
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

                    {items.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {items.map(item => (
                                <div key={item.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                    <div className="relative h-44 bg-slate-50 flex items-center justify-center">
                                        <img src={item.previewUrl} alt={item.file.name} className="max-w-full max-h-full object-contain" />
                                        {item.status === 'processing' && (
                                            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                                                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-800 truncate" title={item.file.name}>{item.file.name}</p>
                                                <p className="text-xs text-slate-500">{item.ratioLabel}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.id)}
                                                disabled={isRemastering}
                                                className="text-slate-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                                                title="Remove"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs font-medium">
                                            {item.status === 'queued' && <span className="text-slate-500">Queued</span>}
                                            {item.status === 'processing' && <span className="text-purple-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Remastering</span>}
                                            {item.status === 'ready' && <span className="text-green-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Ready</span>}
                                            {item.status === 'failed' && <span className="text-red-600">Failed</span>}
                                        </div>
                                        {item.error && <p className="text-xs text-red-600 line-clamp-2">{item.error}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-xs text-slate-500">
                        {statusText}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {failedCount > 0 && !isRemastering && (
                            <Button variant="outline" onClick={handleRetryFailed}>
                                <RotateCw className="w-4 h-4 mr-2" />
                                Retry Failed
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isRemastering}>
                            Cancel
                        </Button>
                        <Button onClick={handleRemasterAll} disabled={!canRemaster} className="bg-purple-600 hover:bg-purple-700 text-white">
                            {isRemastering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            {isRemastering ? 'Remastering...' : 'Remaster'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
