'use client'

import { useState, useEffect, useRef, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/types/page'
import { PageStatusBar, PageStatus } from '@/components/project/PageStatusBar'
import { ReviewHistoryDialog } from '@/components/project/ReviewHistoryDialog'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, AlertCircle, RefreshCw, MessageSquare, CheckCircle2, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { uploadImageAction } from '@/app/actions/upload-image'

interface IllustrationReview {
    id: string
    project_id: string
    page_id: string
    review_text: string
    status: 'pending' | 'resolved'
    created_at: string
}

interface IllustrationsTabContentProps {
    projectId: string
    pages: Page[]
    illustrationStatus: string
    isAnalyzing: boolean
    analysisProgress: { current: number, total: number }
    initialAspectRatio?: string
}

export function IllustrationsTabContent({
    projectId,
    pages,
    illustrationStatus,
    isAnalyzing,
    analysisProgress,
    initialAspectRatio
}: IllustrationsTabContentProps) {
    const router = useRouter()
    const [loadingState, setLoadingState] = useState<{ sketch: boolean; illustration: boolean }>({ sketch: false, illustration: false })
    const [loadingMessage, setLoadingMessage] = useState<{ sketch: string; illustration: string }>({ sketch: 'Updating...', illustration: 'Updating...' })
    const [isGenerating, setIsGenerating] = useState(false)
    const [reviews, setReviews] = useState<IllustrationReview[]>([])
    const [viewingImage, setViewingImage] = useState<string | null>(null)
    const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false)
    const [regenerationPrompt, setRegenerationPrompt] = useState('')

    const handleOpenRegenerate = () => {
        setRegenerationPrompt('') // Or pre-fill if needed
        setIsRegenerateDialogOpen(true)
    }

    const handleRegenerateWithPrompt = async () => {
        setIsRegenerateDialogOpen(false)
        setIsGenerating(true)
        setLoadingState(prev => ({ ...prev, illustration: true }))
        setLoadingMessage(prev => ({ ...prev, illustration: 'Regenerating...' }))
        toast.loading('Regenerating Illustration...', { id: 'regen-wait' })

        try {
            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId: page1.id,
                    customPrompt: regenerationPrompt,
                    currentImageUrl: page1.illustration_url
                })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Regeneration failed')
            }

            const data = await response.json()

            // Update Local State Optimistically/Realistically
            if (data.illustrationUrl) {
                setPage1(prev => ({
                    ...prev,
                    illustration_url: data.illustrationUrl
                }))
                // Note: illustration loading state will be cleared by onLoad handler
            } else {
                setLoadingState(prev => ({ ...prev, illustration: false }))
            }

            toast.dismiss('regen-wait')
            toast.success('Illustration Regenerated!', { description: 'Updating sketch now...' })

            // CHAIN: Generate Sketch Immediately
            if (data.illustrationUrl) {
                await handleGenerateSketch(page1.id, data.illustrationUrl)
            }

            router.refresh()

        } catch (error: any) {
            toast.dismiss('regen-wait')
            toast.error('Regeneration Failed', { description: error.message })
            setLoadingState(prev => ({ ...prev, illustration: false }))
        } finally {
            setIsGenerating(false)
        }
    }

    // Configuration State (Inline)
    const [aspectRatio, setAspectRatio] = useState<string>(initialAspectRatio || '8:10')
    const [textIntegration, setTextIntegration] = useState<string>('integrated')
    const [historyOpen, setHistoryOpen] = useState(false)

    // Find Page 1 (The Style Anchor)
    const initialPage1 = pages.find(p => p.page_number === 1) || pages[0]
    const [page1, setPage1] = useState(initialPage1)

    // Keep sync with server updates
    useEffect(() => {
        setPage1(pages.find(p => p.page_number === 1) || pages[0])
    }, [pages])

    // Fetch Reviews for Page 1
    useEffect(() => {
        if (!page1) return

        const fetchReviews = async () => {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('illustration_reviews')
                .select('*')
                .eq('page_id', page1.id)
                .order('created_at', { ascending: false })

            if (data) {
                setReviews(data as IllustrationReview[])
            }
        }

        fetchReviews()

        // Realtime subscription
        const supabase = createClient()
        const channel = supabase.channel(`reviews-${page1.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'illustration_reviews',
                filter: `page_id=eq.${page1.id}`
            }, (payload) => {
                fetchReviews()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [page1])

    const [isUploading, setIsUploading] = useState(false)
    const sketchInputRef = useRef<HTMLInputElement>(null)
    const illustrationInputRef = useRef<HTMLInputElement>(null)

    // Helper: Calculate ratio from string (e.g. "8:10" -> 0.8)
    const getTargetRatio = (ratioStr: string) => {
        const [w, h] = ratioStr.split(':').map(Number)
        return w / h
    }

    const validateAspectRatio = (file: File, targetRatio: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const img = new window.Image() // Standard HTML Image, handled by browser API
            const objectUrl = URL.createObjectURL(file)
            img.onload = () => {
                const fileRatio = img.width / img.height
                // Allow small tolerance (e.g. +/- 0.05)
                const tolerance = 0.05
                const isValid = Math.abs(fileRatio - targetRatio) <= tolerance
                URL.revokeObjectURL(objectUrl)
                resolve(isValid)
            }
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl)
                resolve(false)
            }
            img.src = objectUrl
        })
    }

    const isManualUpload = (url: string | null | undefined) => {
        return url?.includes('-manual')
    }

    const handleUpload = async (type: 'sketch' | 'illustration', file: File) => {
        // 0. File Validation (Client-Side)
        const MAX_SIZE_MB = 10
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
        const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

        if (file.size > MAX_SIZE_BYTES) {
            toast.error("File Too Large", {
                description: `Please upload an image smaller than ${MAX_SIZE_MB}MB.`
            })
            return
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            toast.error("Invalid File Type", {
                description: "Only JPG, PNG, and WEBP formats are allowed."
            })
            return
        }

        // 1. Aspect Ratio Validation
        const targetRatio = getTargetRatio(aspectRatio)
        const isValidInitial = await validateAspectRatio(file, targetRatio)

        if (!isValidInitial) {
            toast.error("Aspect Ratio Mismatch", {
                description: `Please upload an image with aspect ratio ${aspectRatio}.`
            })
            return
        }

        setIsUploading(true)
        setLoadingState(prev => ({ ...prev, [type]: true }))
        setLoadingMessage(prev => ({ ...prev, [type]: 'Uploading...' }))
        const toastId = toast.loading(`Uploading ${type}...`)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('projectId', projectId)
            formData.append('pageId', page1.id)
            formData.append('pageNumber', page1.page_number.toString())
            formData.append('type', type)

            const currentUrl = type === 'sketch' ? page1.sketch_url : page1.illustration_url
            if (currentUrl) {
                formData.append('currentUrl', currentUrl)
            }

            // Call Server Action
            // We need to dynamically import or having imported it at top level.
            // Since this is client component, we can import server action directly.
            const result = await uploadImageAction(formData)

            if (!result.success) {
                throw new Error(result.error)
            }

            toast.success("Upload Successful", {
                id: toastId,
                description: `Successfully uploaded and updated ${type}.`,
            })

            // Optimistic Update: Manually update the URL in the local state to show "Uploaded" tag immediately
            if (result.url) {
                // Determine if we need to force re-render by ensuring URL is different/cache-busted
                // Wait, if result.url is same, we might want to append query param
                const newUrl = result.url.includes('?') ? `${result.url}&t=${Date.now()}` : `${result.url}?t=${Date.now()}`

                setPage1(prev => ({
                    ...prev,
                    [type === 'sketch' ? 'sketch_url' : 'illustration_url']: newUrl
                }))

                // AUTOMATIC SKETCH REGENERATION
                // If the user uploads a new illustration (manual edit), we must regenerate the sketch
                // to ensure they match (e.g. if items were removed).
                if (type === 'illustration') {
                    // We don't await this blocking the UI, but we trigger it
                    handleGenerateSketch(page1.id, result.url) // Use original URL for generation
                }

                startTransition(() => {
                    router.refresh()
                })
            } else {
                setLoadingState(prev => ({ ...prev, [type]: false }))
                router.refresh()
            }

        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error("Upload Failed", {
                id: toastId,
                description: error.message || "An unexpected error occurred."
            })
            setLoadingState(prev => ({ ...prev, [type]: false }))
        } finally {
            setIsUploading(false)
        }
    }

    const onFileSelect = (type: 'sketch' | 'illustration') => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleUpload(type, e.target.files[0])
        }
    }

    const handleDownload = (url: string, filename: string) => {
        // Use proxy to force correct filename and avoid CORS issues
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
        window.location.href = downloadUrl
    }

    const handleGenerateValues = async () => {
        if (!page1) return

        setIsGenerating(true)
        try {
            // 1. Save Configuration First (Triggers Analysis)
            const configResponse = await fetch('/api/illustrations/configure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    aspect_ratio: aspectRatio,
                    text_integration: textIntegration
                })
            })

            if (!configResponse.ok) {
                throw new Error('Failed to save configuration settings')
            }

            // 1.5 Wait for Analysis (Polling)
            const waitForAnalysis = async () => {
                const maxAttempts = 30 // 30 * 2s = 60s timeout
                let attempts = 0

                // Indicate we are waiting (optional: update UI state here if needed more granularly)
                // For now, isGenerating covers it but we can use toast updates
                toast.loading('AI Director Analyzing Page 1...', { id: 'analysis-wait' })

                while (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 2000)) // Wait 2s

                    try {
                        const res = await fetch(`/api/projects/${projectId}/pages/${page1.id}/status`)
                        if (res.ok) {
                            const data = await res.json()
                            if (data.hasActions) {
                                toast.dismiss('analysis-wait')
                                return true
                            }
                        }
                    } catch (e) {
                        // Ignore fetch errors during poll
                    }
                    attempts++
                }
                toast.dismiss('analysis-wait')
                throw new Error('Analysis timed out. Please try again.')
            }

            await waitForAnalysis()

            // 2. Trigger Generation
            toast.loading('Painting Illustration...', { id: 'painting-wait' })
            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId: page1.id
                })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Generation failed')
            }

            const data = await response.json()
            toast.dismiss('painting-wait')
            toast.success('Illustration Generated!', { description: 'Creating sketch now...' })

            if (data.illustrationUrl) {
                setPage1(prev => ({
                    ...prev,
                    illustration_url: data.illustrationUrl
                }))
                handleGenerateSketch(page1.id, data.illustrationUrl)
            }

            router.refresh()
        } catch (error: any) {
            toast.dismiss('analysis-wait')
            toast.dismiss('painting-wait')
            toast.error('Process Failed', { description: error.message })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleGenerateSketch = async (pageId: string, illustrationUrl: string) => {
        setLoadingState(prev => ({ ...prev, sketch: true }))
        setLoadingMessage(prev => ({ ...prev, sketch: 'Regenerating...' }))
        try {
            toast.info('Starting Sketch Generation...', { description: 'Converting illustration to pencil sketch.' })
            const res = await fetch('/api/illustrations/generate-sketch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, pageId, illustrationUrl })
            })

            if (res.ok) {
                const data = await res.json()
                if (data.sketchUrl) {
                    setPage1(prev => ({
                        ...prev,
                        sketch_url: data.sketchUrl
                    }))
                    // Note: sketch loading state will be cleared by onLoad handler
                } else {
                    setLoadingState(prev => ({ ...prev, sketch: false }))
                }
            } else {
                setLoadingState(prev => ({ ...prev, sketch: false }))
            }

            toast.success('Sketch Ready!')
            router.refresh()
        } catch (e) {
            console.error('Sketch trigger failed', e)
            setLoadingState(prev => ({ ...prev, sketch: false }))
        }
    }

    // 1. Analyzing State
    if (isAnalyzing) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-6 min-h-[400px]">
                <div className="relative">
                    <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping opacity-75"></div>
                    <div className="relative bg-purple-600 rounded-full p-4">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-xl font-semibold text-slate-900">Analyzing Story Board...</h2>
                    <p className="text-slate-500 text-sm">
                        The AI Director is reading each page to plan character actions, camera angles, and composition.
                    </p>
                </div>
                <div className="w-full max-w-sm space-y-2">
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-purple-600 transition-all duration-300 ease-out"
                            style={{ width: `${(analysisProgress.current / (analysisProgress.total || 1)) * 100}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-400 font-medium">
                        analyzing page {analysisProgress.current} of {analysisProgress.total}
                    </p>
                </div>
            </div>
        )
    }

    // 2. Generating State
    if (isGenerating && !page1?.illustration_url) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-6 min-h-[400px]">
                <div className="relative">
                    <div className="absolute inset-0 bg-pink-100 rounded-full animate-pulse opacity-75"></div>
                    <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-full p-4">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-slate-900">Painting Illustration...</h2>
                    <p className="text-slate-500 text-sm">Applying watercolors and defining style from references.</p>
                </div>
            </div>
        )
    }

    // 3. Review State (Has Image)
    if (page1?.illustration_url) {
        return (
            <div className="max-w-[1600px] mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">

                    {/* Left Column: Reviews (Desktop Only - Unified Block) */}
                    <div className="hidden md:flex w-72 flex-col shrink-0 border-r border-slate-100 bg-slate-50/50 h-full">
                        <div className="p-4 border-b border-slate-100 h-[73px] flex items-center justify-between shrink-0">
                            <h4 className="font-semibold text-slate-800">Reviews</h4>
                            <Button variant="outline" size="sm" onClick={handleOpenRegenerate} disabled={isGenerating} title="Regenerate with Instructions">
                                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                Regenerate
                            </Button>
                        </div>

                        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
                            {/* Current Unresolved Feedback from Page (Priority) */}
                            {page1.feedback_notes && !page1.is_resolved && (
                                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-yellow-900 relative animate-in fade-in">
                                    <div className="flex items-start gap-2">
                                        <MessageSquare className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="text-xs font-semibold text-amber-800 uppercase block mb-1">Current Request</span>
                                            <p className="whitespace-pre-wrap">{page1.feedback_notes}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Resolved Feedback (Ready to Resend) */}
                            {page1.feedback_notes && page1.is_resolved && (
                                <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm flex items-start gap-2 relative animate-in fade-in">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                    <p className="leading-relaxed text-green-900">
                                        <span className="font-bold text-green-700 uppercase text-xs mr-2">Resolved (Resend):</span>
                                        {page1.feedback_notes}
                                    </p>
                                </div>
                            )}

                            {/* Historic Resolved Reviews (Already Sent) - Reversed to show recent first */}
                            {/* @ts-ignore */}
                            {page1.feedback_history?.slice().reverse().map((item: any, index: number) => (
                                <div key={`hist-${index}`} className="bg-green-50/80 border border-green-200/60 rounded-md p-3 text-sm flex items-start gap-2 relative animate-in fade-in">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                    <p className="leading-relaxed text-green-900">
                                        <span className="font-bold text-green-700 uppercase text-xs mr-2">Resolved:</span>
                                        {item.note}
                                    </p>
                                </div>
                            ))}

                            {/* Pending Reviews (legacy or secondary) */}
                            {reviews.filter(r => r.status === 'pending').map(review => (
                                <div key={review.id} className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-900 relative animate-in fade-in">
                                    <div className="flex items-start gap-2">
                                        <MessageSquare className="w-4 h-4 text-yellow-600 mt-0.5" />
                                        <div>
                                            <span className="text-xs font-semibold text-yellow-800 uppercase block mb-1">Customer Feedback</span>
                                            <p>{review.review_text}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Resolved Reviews */}
                            {reviews.filter(r => r.status === 'resolved').map(review => (
                                <div key={review.id} className="bg-green-50 border border-green-200 rounded-md p-3 text-sm flex items-start gap-2 relative animate-in fade-in">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                    <p className="leading-relaxed text-green-900">
                                        <span className="font-bold text-green-700 uppercase text-xs mr-2">Resolved:</span>
                                        {review.review_text}
                                    </p>
                                </div>
                            ))}

                            {reviews.length === 0 && (
                                <div className="text-sm text-slate-400 italic text-center py-4">
                                    No reviews yet.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Images */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Mobile Header */}


                        {/* Mobile: Page Status Bar & History */}
                        <div className="md:hidden border-b border-slate-100 bg-white">
                            <div className="px-4 pt-4 pb-2">
                                <h3 className="font-bold text-slate-800">Page {page1.page_number}</h3>
                            </div>
                            <PageStatusBar
                                status={
                                    page1.feedback_notes && !page1.is_resolved ? 'request' :
                                        page1.is_resolved ? 'resolved' : 'fresh'
                                }
                                labelText={
                                    page1.feedback_notes && !page1.is_resolved ? `Request: ${page1.feedback_notes}` :
                                        page1.is_resolved ? 'Resolved' : 'No Reviews'
                                }
                                onStatusClick={() => setHistoryOpen(true)}
                                actionButton={
                                    <Button variant="ghost" size="icon" onClick={handleOpenRegenerate} disabled={isGenerating} className="h-8 w-8 rounded-full bg-slate-100 text-slate-600">
                                        <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                    </Button>
                                }
                            />
                            <ReviewHistoryDialog
                                open={historyOpen}
                                onOpenChange={setHistoryOpen}
                                page={page1}
                            />
                        </div>

                        {/* Desktop Header (Split) */}
                        <div className="hidden md:grid grid-cols-2 divide-x border-b border-slate-100 h-[73px] bg-white">
                            <div className="flex items-center justify-center gap-2 relative">
                                <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                                    Pencil Sketch
                                </h4>
                                {isManualUpload(page1.sketch_url) && (
                                    <span className="absolute top-1/2 -translate-y-1/2 right-5 px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-600 rounded border border-rose-100 leading-none">
                                        UPLOADED
                                    </span>
                                )}
                                {page1.sketch_url && (
                                    <button
                                        onClick={() => handleDownload(page1.sketch_url!, `Page-${page1.page_number}-Sketch.jpg`)}
                                        className="text-slate-400 hover:text-purple-600 transition-colors"
                                        title="Download Sketch"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    className="h-8 w-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
                                    onClick={() => sketchInputRef.current?.click()}
                                    disabled={isUploading}
                                    title="Upload Sketch"
                                >
                                    <Upload className="h-4 w-4" />
                                </button>
                                <input
                                    type="file"
                                    ref={sketchInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={onFileSelect('sketch')}
                                />
                            </div>
                            <div className="flex items-center justify-center gap-2 relative bg-slate-50/30">
                                <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                                    Final Illustration
                                </h4>
                                {isManualUpload(page1.illustration_url) && (
                                    <span className="absolute top-1/2 -translate-y-1/2 right-5 px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-600 rounded border border-rose-100 leading-none">
                                        UPLOADED
                                    </span>
                                )}
                                {page1.illustration_url && (
                                    <button
                                        onClick={() => handleDownload(page1.illustration_url!, `Page-${page1.page_number}-Illustration.jpg`)}
                                        className="text-slate-400 hover:text-purple-600 transition-colors"
                                        title="Download Illustration"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    className="h-8 w-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
                                    onClick={() => illustrationInputRef.current?.click()}
                                    disabled={isUploading}
                                    title="Upload Illustration"
                                >
                                    <Upload className="h-4 w-4" />
                                </button>
                                <input
                                    type="file"
                                    ref={illustrationInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={onFileSelect('illustration')}
                                />
                            </div>
                        </div>

                        {/* Grid: Sketch Left, Illustration Right. Touching. */}
                        <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                            {/* 1. Sketch (First/Left) */}
                            <div className="p-6 md:p-0 flex flex-col items-center space-y-4 md:space-y-0 bg-white relative">
                                <div className="flex items-center gap-2 md:hidden">
                                    <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Sketch</span>
                                    {page1.sketch_url && (
                                        <button
                                            onClick={() => handleDownload(page1.sketch_url!, `Page-${page1.page_number}-Sketch.jpg`)}
                                            className="text-slate-400 hover:text-purple-600 transition-colors"
                                            title="Download Sketch"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
                                        onClick={() => sketchInputRef.current?.click()}
                                        disabled={isUploading}
                                        title="Upload Sketch"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </button>
                                </div>
                                <div
                                    className="relative w-full cursor-pointer hover:opacity-95 transition-opacity"
                                    onClick={() => page1.sketch_url && setViewingImage(page1.sketch_url)}
                                >
                                    {page1.sketch_url ? (
                                        <img
                                            src={page1.sketch_url}
                                            alt="Generated Sketch"
                                            onLoad={() => setLoadingState(prev => ({ ...prev, sketch: false }))}
                                            className="w-full h-auto object-cover grayscale contrast-125 rounded-lg md:rounded-none shadow-sm md:shadow-none border border-slate-200 md:border-none"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 min-h-[400px]">
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                            <span className="text-sm">Generating sketch...</span>
                                        </div>
                                    )}
                                    {loadingState.sketch && (
                                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-50 rounded-lg">
                                            <div className="flex flex-col items-center gap-2 bg-white p-3 rounded-lg shadow-sm border">
                                                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                                                <span className="text-xs font-semibold text-purple-700">{loadingMessage.sketch}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. Illustration (Second/Right) */}
                            <div className="p-6 md:p-0 flex flex-col items-center space-y-4 md:space-y-0 bg-slate-50/10 relative">
                                <div className="flex items-center gap-2 md:hidden">
                                    <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Colored</span>
                                    <button
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-purple-600 transition-colors mr-1"
                                        onClick={handleOpenRegenerate}
                                        disabled={isGenerating}
                                        title="Regenerate"
                                    >
                                        <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => handleDownload(page1.illustration_url!, `Page-${page1.page_number}-Illustration.jpg`)}
                                        className="text-slate-400 hover:text-purple-600 transition-colors"
                                        title="Download Illustration"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
                                        onClick={() => illustrationInputRef.current?.click()}
                                        disabled={isUploading}
                                        title="Upload Illustration"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </button>
                                </div>
                                <div
                                    className="relative w-full cursor-pointer hover:opacity-95 transition-opacity"
                                    onClick={() => setViewingImage(page1.illustration_url || null)}
                                >
                                    <img
                                        src={page1.illustration_url}
                                        alt="Generated Illustration"
                                        onLoad={() => setLoadingState(prev => ({ ...prev, illustration: false }))}
                                        className="w-full h-auto object-cover rounded-lg md:rounded-none shadow-lg md:shadow-none border border-slate-100 md:border-none"
                                    />
                                    {loadingState.illustration && (
                                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-50 rounded-lg">
                                            <div className="flex flex-col items-center gap-2 bg-white p-3 rounded-lg shadow-sm border">
                                                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                                                <span className="text-xs font-semibold text-purple-700">{loadingMessage.illustration}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lightbox */}
                <Dialog open={!!viewingImage} onOpenChange={(open) => !open && setViewingImage(null)}>
                    <DialogContent
                        showCloseButton={false}
                        className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                    >
                        <DialogTitle className="sr-only">Full Size Image</DialogTitle>

                        {/* Wrapper to center image - Click to close */}
                        <div className="relative w-full h-full flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
                            {viewingImage && (
                                <img
                                    src={viewingImage}
                                    alt="Full size"
                                    className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                        </div>

                        {/* Screen-level Close Button */}
                        <button
                            className="absolute top-6 right-6 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50"
                            onClick={() => setViewingImage(null)}
                        >
                            <span className="sr-only">Close</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </DialogContent>
                </Dialog>

                {/* Regeneration Dialog */}
                <Dialog open={isRegenerateDialogOpen} onOpenChange={setIsRegenerateDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Regenerate Illustration</DialogTitle>
                            <DialogDescription>
                                Provide instructions to edit the current illustration. The AI will use your text and the current image as a reference.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            <div className="space-y-2">
                                <Label>Edit Instructions</Label>
                                <Textarea
                                    value={regenerationPrompt}
                                    onChange={(e) => setRegenerationPrompt(e.target.value)}
                                    placeholder="e.g., Make the sky darker, add a red hat to the main character..."
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsRegenerateDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleRegenerateWithPrompt} disabled={isGenerating || !regenerationPrompt.trim()}>
                                {isGenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Regenerate
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        )
    }

    // 4. Empty State (Ready to Generate) - NOW WITH INLINE CONFIG
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 md:p-12 text-center flex flex-col items-center justify-center space-y-8 min-h-[400px]">
            <div className="space-y-4 max-w-md w-full">
                <div className="flex flex-col items-center mb-6">
                    <div className="bg-purple-50 p-6 rounded-full mb-4">
                        <Sparkles className="w-10 h-10 text-purple-600" />
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-900">Ready to Create Art</h2>
                    <p className="text-slate-500 mt-2">
                        The AI Director has analyzed the story. We will now generate <b>Page 1</b> to establish the artistic style for the entire book.
                    </p>
                </div>

                <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100 space-y-6 text-left">
                    {/* Aspect Ratio Selection */}
                    <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Aspect Ratio</Label>
                        <RadioGroup
                            value={aspectRatio}
                            onValueChange={setAspectRatio}
                            className="flex flex-col space-y-2"
                        >
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="8:10" id="8:10" />
                                <Label htmlFor="8:10" className="font-medium text-sm cursor-pointer text-slate-700">8×10 inches (Portrait)</Label>
                            </div>
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="8.5:8.5" id="8.5:8.5" />
                                <Label htmlFor="8.5:8.5" className="font-medium text-sm cursor-pointer text-slate-700">8.5×8.5 inches (Square)</Label>
                            </div>
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="8.5:11" id="8.5:11" />
                                <Label htmlFor="8.5:11" className="font-medium text-sm cursor-pointer text-slate-700">8.5×11 inches (Letter)</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="h-px bg-slate-200"></div>

                    {/* Text Placement Selection */}
                    <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Text Placement</Label>
                        <RadioGroup
                            value={textIntegration}
                            onValueChange={setTextIntegration}
                            className="flex flex-col space-y-2"
                        >
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="separate" id="separate" />
                                <Label htmlFor="separate" className="font-medium text-sm cursor-pointer text-slate-700">Separate text pages</Label>
                            </div>
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="integrated" id="integrated" />
                                <Label htmlFor="integrated" className="font-medium text-sm cursor-pointer text-slate-700">Integrated in illustrations</Label>
                            </div>
                        </RadioGroup>
                    </div>
                </div>
            </div>

            <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-xl shadow-purple-200 transition-all hover:scale-105 min-w-[240px]"
                onClick={handleGenerateValues}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Initializing...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Generate First Illustration
                    </>
                )}
            </Button>
        </div>
    )
}
