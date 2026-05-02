'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/types/page'
import { createClient } from '@/lib/supabase/client'
import { SharedIllustrationBoard } from '@/components/illustration/SharedIllustrationBoard'

// ... imports ...

interface IllustrationItemProps {
    page: Page
    projectId: string
    projectReviews: unknown[]
    initialAspectRatio?: string
    initialTextIntegration?: string | null
}

export function IllustrationItem({
    page,
    projectId,
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

    const [regenerationPrompt] = useState('')

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
            if (data.illustrationUrl) {
                handleGenerateSketch(data.illustrationUrl)
            }
            router.refresh()
        } catch (error: unknown) {
            console.error('Failed to generate illustration:', error)
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
        setIsGenerating(true)
        setLoadingState(prev => ({ ...prev, illustration: true }))

        try {
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
            if (data.illustrationUrl) {
                handleGenerateSketch(data.illustrationUrl)
            }
            router.refresh()
        } catch (error: unknown) {
            console.error('Failed to regenerate illustration:', error)
        } finally {
            setIsGenerating(false)
            setLoadingState(prev => ({ ...prev, illustration: false }))
        }
    }

    const handleUpload = async (type: 'sketch' | 'illustration', file: File) => {
        setIsUploading(true)
        setLoadingState(prev => ({ ...prev, [type]: true }))
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('projectId', projectId)
            formData.append('pageId', page.id)
            formData.append('pageNumber', page.page_number.toString())
            formData.append('type', type)

            const response = await fetch('/api/illustrations/upload', { method: 'POST', body: formData })
            const result = await response.json()
            if (!result.success) throw new Error(result.error || 'Upload failed')
            if (type === 'illustration' && result.url) {
                handleGenerateSketch(result.url)
            }
            router.refresh()
        } catch (error: unknown) {
            console.error('Failed to upload illustration asset:', error)
        } finally {
            setIsUploading(false)
            setLoadingState(prev => ({ ...prev, [type]: false }))
        }
    }

    const handleSaveFeedback = async (notes: string) => {
        const supabase = createClient()
        const { error } = await supabase
            .from('pages')
            .update({ feedback_notes: notes })
            .eq('id', page.id)

        if (error) {
            throw error
        }

        router.refresh()
    }


    // -------------------------------------------------------------------------
    // RENDER (Unified via SharedIllustrationBoard)
    // -------------------------------------------------------------------------

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
