'use client'

import { useState, useRef, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/types/page'
import { PageStatusBar, PageStatus } from '@/components/project/PageStatusBar'
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
import { SharedIllustrationBoard } from '@/components/illustration/SharedIllustrationBoard'

// ... imports ...

interface IllustrationItemProps {
    page: Page
    projectId: string
    projectReviews: any[]
    initialAspectRatio?: string
    initialTextIntegration?: string | null
}

export function IllustrationItem({
    page,
    projectId,
    projectReviews,
    initialAspectRatio,
    initialTextIntegration
}: IllustrationItemProps) {
    const router = useRouter()

    // Local State specific to this Page Form
    const [aspectRatio, setAspectRatio] = useState<string>(initialAspectRatio || '8:10')
    const [textIntegration, setTextIntegration] = useState<string>(initialTextIntegration || 'integrated')

    // State
    const [isGenerating, setIsGenerating] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [loadingState, setLoadingState] = useState<{ sketch: boolean; illustration: boolean }>({ sketch: false, illustration: false })
    const [loadingMessage, setLoadingMessage] = useState<{ sketch: string; illustration: string }>({ sketch: '', illustration: '' })

    const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false)
    const [regenerationPrompt, setRegenerationPrompt] = useState('')
    const [isImageViewerOpen, setIsImageViewerOpen] = useState(false)
    const [viewedImage, setViewedImage] = useState<string | null>(null)

    const sketchInputRef = useRef<HTMLInputElement>(null)
    const illustrationInputRef = useRef<HTMLInputElement>(null)

    // Filter reviews for this page
    const pageReviews = projectReviews.filter(r => r.page_id === page.id)
    const hasUnresolvedFeedback = page.feedback_notes && !page.is_resolved

    // -------------------------------------------------------------------------
    // HANDLERS
    // -------------------------------------------------------------------------

    const handleGenerateValues = async () => {
        setIsGenerating(true)
        try {
            // 1. Save Config
            await fetch('/api/illustrations/configure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, aspect_ratio: aspectRatio, text_integration: textIntegration })
            })

            // 2. Trigger Generation
            toast.loading(`Painting Page ${page.page_number}...`, { id: `painting-${page.id}` })
            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, pageId: page.id })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Generation failed')
            }

            const data = await response.json()
            toast.dismiss(`painting-${page.id}`)
            toast.success('Illustration Generated!', { description: 'Creating sketch now...' })

            if (data.illustrationUrl) {
                handleGenerateSketch(data.illustrationUrl)
            }
            router.refresh()
        } catch (error: any) {
            toast.dismiss(`painting-${page.id}`)
            toast.error('Process Failed', { description: error.message })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleGenerateSketch = async (illustrationUrl: string) => {
        setLoadingState(prev => ({ ...prev, sketch: true }))
        try {
            const res = await fetch('/api/illustrations/generate-sketch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, pageId: page.id, illustrationUrl })
            })
            if (!res.ok) throw new Error('Sketch failed')
            router.refresh()
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingState(prev => ({ ...prev, sketch: false }))
        }
    }

    const handleRegenerateWithPrompt = async () => {
        setIsRegenerateDialogOpen(false)
        setIsGenerating(true)
        setLoadingState(prev => ({ ...prev, illustration: true }))

        try {
            toast.loading('Regenerating...', { id: 'regen-wait' })
            const response = await fetch('/api/illustrations/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId: page.id,
                    customPrompt: regenerationPrompt,
                    currentImageUrl: page.illustration_url
                })
            })

            if (!response.ok) throw new Error('Regeneration failed')

            const data = await response.json()
            toast.dismiss('regen-wait')
            toast.success('Regenerated!')

            if (data.illustrationUrl) {
                handleGenerateSketch(data.illustrationUrl)
            }
            router.refresh()
        } catch (error: any) {
            toast.dismiss('regen-wait')
            toast.error('Failed', { description: error.message })
        } finally {
            setIsGenerating(false)
            setLoadingState(prev => ({ ...prev, illustration: false }))
        }
    }

    const handleUpload = async (type: 'sketch' | 'illustration', file: File) => {
        setIsUploading(true)
        setLoadingState(prev => ({ ...prev, [type]: true }))
        const toastId = toast.loading(`Uploading ${type}...`)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('projectId', projectId)
            formData.append('pageId', page.id)
            formData.append('type', type)
            if (type === 'sketch' && page.sketch_url) formData.append('currentUrl', page.sketch_url)
            if (type === 'illustration' && page.illustration_url) formData.append('currentUrl', page.illustration_url)

            const result = await uploadImageAction(formData)
            if (!result.success) throw new Error(result.error)

            toast.success("Upload Successful", { id: toastId })

            if (type === 'illustration' && result.url) {
                handleGenerateSketch(result.url)
            }
            router.refresh()
        } catch (error: any) {
            toast.error("Upload Failed", { id: toastId, description: error.message })
        } finally {
            setIsUploading(false)
            setLoadingState(prev => ({ ...prev, [type]: false }))
        }
    }

    const onFileSelect = (type: 'sketch' | 'illustration') => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) handleUpload(type, e.target.files[0])
    }

    const handleDownload = (url: string, filename: string) => {
        window.location.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
    }

    const handleSaveFeedback = async (notes: string) => {
        const supabase = createClient()
        const { error } = await supabase
            .from('pages')
            .update({ feedback_notes: notes })
            .eq('id', page.id)

        if (error) {
            toast.error('Failed to save notes')
            throw error
        }

        toast.success('Notes saved')
        router.refresh()
    }


    // -------------------------------------------------------------------------
    // RENDER (Unified via SharedIllustrationBoard)
    // -------------------------------------------------------------------------

    // We import the SharedIllustrationBoard dynamically or directly.
    // Ensure to add import at top (I will handle imports in a separate block if needed, but here assuming imports exist).

    return (
        <SharedIllustrationBoard
            mode="admin"
            page={page}

            // State
            isGenerating={isGenerating}
            isUploading={isUploading}
            loadingState={loadingState}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            textIntegration={textIntegration}
            setTextIntegration={setTextIntegration}

            // Handlers
            onGenerate={handleGenerateValues}
            onRegenerate={handleRegenerateWithPrompt}
            onUpload={handleUpload}
            onSaveFeedback={handleSaveFeedback}
        />
    )
}
