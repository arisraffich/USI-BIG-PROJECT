import { useState, useEffect, useMemo } from 'react'
import { Page } from '@/types/page'
import { createClient } from '@/lib/supabase/client'
import { UnifiedIllustrationFeed } from '@/components/illustration/UnifiedIllustrationFeed'
import { uploadImageAction } from '@/app/actions/upload-image'
import { toast } from 'sonner'

import { useRouter } from 'next/navigation'

interface IllustrationsTabContentProps {
    projectId: string
    pages: Page[]
    illustrationStatus: string
    isAnalyzing: boolean
    analysisProgress: { current: number, total: number }
    initialAspectRatio?: string
    initialTextIntegration?: string | null
    activePageId?: string | null
    onPageChange?: (pageId: string) => void
}

export function IllustrationsTabContent({
    projectId,
    pages,
    illustrationStatus,
    isAnalyzing,
    initialAspectRatio,
    initialTextIntegration,
    activePageId,
    onPageChange
}: IllustrationsTabContentProps) {
    const router = useRouter()

    // MEMOIZE VISIBLE PAGES to prevent unstable references passed to children
    const visiblePages = useMemo(() => {
        return ['illustration_approved', 'completed'].includes(illustrationStatus)
            ? pages
            : pages.slice(0, 1)
    }, [pages, illustrationStatus])

    // Local state for wizard settings (propagated to pages if needed via DB)
    const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || '')
    const [textIntegration, setTextIntegration] = useState(initialTextIntegration || '')
    const [generatingPageIds, setGeneratingPageIds] = useState<Set<string>>(new Set())
    const [loadingState, setLoadingState] = useState<{ [key: string]: { sketch: boolean; illustration: boolean } }>({})

    const handleGenerate = async (page: Page, referenceImageUrl?: string) => {
        try {
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true, sketch: false } })) // Lock illustration initially
            // Actually, for NEW generation, we lock IS_GENERATING (empty state).
            // But for REGENERATION, we want granular.
            // Let's stick to the flow:

            const supabase = createClient()
            // 1. Save preferences to Project
            await supabase.from('projects').update({
                illustration_aspect_ratio: aspectRatio,
                illustration_text_integration: textIntegration
            }).eq('id', projectId)

            // 2. Trigger Generation (API)
            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId: page.id, projectId, referenceImageUrl })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Generation failed')
            }
            const data = await response.json()
            toast.success('Illustration Generated!', { description: 'Starting sketch generation...' })

            // 3. Chain: Generate Sketch Immediately
            if (data.illustrationUrl) {
                try {
                    setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: false, sketch: true } }))
                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, pageId: page.id, illustrationUrl: data.illustrationUrl })
                    })
                    if (sketchRes.ok) {
                        toast.success('Sketch Generated!')
                    } else {
                        const errData = await sketchRes.json().catch(() => ({}))
                        console.error("Sketch generation failed:", errData)
                        toast.error('Sketch generation failed')
                    }
                } catch (e) {
                    console.error("Sketch trigger failed", e)
                    toast.error('Sketch generation failed')
                }
            }
            
            // Refresh AFTER sketch generation to update UI with both illustration and sketch
            router.refresh()
        } catch (error) {
            toast.error('Failed to start generation')
            console.error(error)
        } finally {
            setGeneratingPageIds(prev => {
                const next = new Set(prev)
                next.delete(page.id)
                return next
            })
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: false } }))
        }
    }

    const handleRegenerate = async (page: Page, prompt: string, referenceImages?: string[]) => {
        try {
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true } }))

            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId: page.id,
                    customPrompt: prompt,
                    currentImageUrl: page.illustration_url,
                    referenceImages // Array of base64 strings
                })
            })

            if (!response.ok) throw new Error('Regeneration failed')

            const data = await response.json()
            toast.success('Illustration Regenerated!', { description: 'Updating sketch...' })

            // Unlock Illustration, Lock Sketch
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: true } }))

            // Chain: Generate Sketch Immediately
            if (data.illustrationUrl) {
                try {
                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, pageId: page.id, illustrationUrl: data.illustrationUrl })
                    })
                    if (sketchRes.ok) {
                        toast.success('Sketch Updated')
                    } else {
                        const errData = await sketchRes.json().catch(() => ({}))
                        console.error("Sketch regeneration failed:", errData)
                        toast.error('Sketch update failed')
                    }
                } catch (e) {
                    console.error("Sketch trigger failed", e)
                    toast.error('Sketch update failed')
                }
            }
            
            // Refresh AFTER sketch generation to update UI with both illustration and sketch
            router.refresh()
        } catch (error) {
            toast.error('Failed to regenerate')
        } finally {
            setGeneratingPageIds(prev => {
                const next = new Set(prev)
                next.delete(page.id)
                return next
            })
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: false } }))
        }
    }

    const handleUpload = async (page: Page, type: 'sketch' | 'illustration', file: File) => {
        try {
            // Set granular loading state specifically for the type being uploaded
            setLoadingState(prev => ({
                ...prev,
                [page.id]: {
                    ...prev[page.id],
                    [type]: true
                }
            }))

            const formData = new FormData()
            formData.append('file', file)
            formData.append('projectId', projectId)
            formData.append('pageId', page.id)
            formData.append('pageNumber', page.page_number.toString())
            formData.append('type', type)

            const result = await uploadImageAction(formData)
            if (result.error) throw new Error(result.error)

            toast.success('Image uploaded successfully')
            
            // Always refresh after successful upload to update is_resolved state
            router.refresh()

            // --- CHAIN: Auto-Generate Sketch if Illustration Uploaded ---
            if (type === 'illustration' && result.url) {
                try {
                    toast.info('Generating matching sketch...')

                    // Switch loading state: Illustration done (upload), Sketch start (gen)
                    setLoadingState(prev => ({
                        ...prev,
                        [page.id]: {
                            illustration: false, // Upload done
                            sketch: true // Gen start
                        }
                    }))

                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            projectId,
                            pageId: page.id,
                            illustrationUrl: result.url
                        })
                    })

                    if (!sketchRes.ok) throw new Error('Sketch auto-generation failed')

                    toast.success('Sketch generated from upload')
                    router.refresh()

                } catch (sketchError) {
                    console.error("Auto-sketch failed", sketchError)
                    toast.error('Failed to auto-generate sketch')
                }
            }

        } catch (error) {
            toast.error('Upload failed')
            console.error(error)
        } finally {
            // Clear ALL loading states for this page to be safe
            setLoadingState(prev => ({
                ...prev,
                [page.id]: {
                    illustration: false,
                    sketch: false
                }
            }))
        }
    }

    return (
        <UnifiedIllustrationFeed
            mode="admin"
            pages={visiblePages}
            activePageId={activePageId}
            onPageChange={onPageChange}
            illustrationStatus={illustrationStatus}
            isAnalyzing={isAnalyzing}
            projectId={projectId}

            // Handlers
            onGenerate={handleGenerate}
            onRegenerate={handleRegenerate}
            onUpload={handleUpload}

            // Wizard State
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            textIntegration={textIntegration}
            setTextIntegration={setTextIntegration}
            generatingPageIds={generatingPageIds}
            loadingStateMap={loadingState}
        />
    )
}
