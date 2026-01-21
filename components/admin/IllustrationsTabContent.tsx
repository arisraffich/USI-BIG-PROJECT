import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { createClient } from '@/lib/supabase/client'
import { UnifiedIllustrationFeed } from '@/components/illustration/UnifiedIllustrationFeed'
import { SceneCharacter } from '@/components/illustration/SharedIllustrationBoard'
import { uploadImageAction } from '@/app/actions/upload-image'
import { toast } from 'sonner'

import { useRouter } from 'next/navigation'

// Batch generation state type
interface BatchGenerationState {
    isRunning: boolean
    total: number
    completed: number
    failed: number
    currentPageIds: Set<string>
}

// Error state for failed generations
interface GenerationError {
    message: string
    technicalDetails: string
}

// Map API errors to user-friendly messages
function mapErrorToUserMessage(error: string): { message: string; technicalDetails: string } {
    const lowerError = error.toLowerCase()
    
    if (lowerError.includes('rate') || lowerError.includes('quota') || lowerError.includes('limit')) {
        return {
            message: 'Too many requests - please wait a moment and try again',
            technicalDetails: error
        }
    }
    if (lowerError.includes('safety') || lowerError.includes('blocked') || lowerError.includes('moderation') || lowerError.includes('policy')) {
        return {
            message: 'Content flagged by safety filters - please revise the scene description',
            technicalDetails: error
        }
    }
    if (lowerError.includes('no image generated')) {
        return {
            message: 'Generation failed - try editing the Illustration Notes and regenerating',
            technicalDetails: error
        }
    }
    
    return {
        message: 'Generation failed - please try editing the scene description',
        technicalDetails: error
    }
}

interface IllustrationsTabContentProps {
    projectId: string
    pages: Page[]
    characters?: Character[] // All project characters for character control
    projectStatus: string // Main status field
    isAnalyzing: boolean
    analysisProgress: { current: number, total: number }
    initialAspectRatio?: string
    initialTextIntegration?: string | null
    activePageId?: string | null
    onPageChange?: (pageId: string) => void
    
    // External error state (shared with sidebar)
    pageErrors?: { [pageId: string]: { message: string; technicalDetails: string } }
    onPageErrorsChange?: React.Dispatch<React.SetStateAction<{ [pageId: string]: { message: string; technicalDetails: string } }>>
    
    // Callback to sync generating state with parent (for sidebar)
    onGeneratingPageIdsChange?: (pageIds: string[]) => void
}

export function IllustrationsTabContent({
    projectId,
    pages,
    characters = [],
    projectStatus,
    isAnalyzing,
    initialAspectRatio,
    initialTextIntegration,
    activePageId,
    onPageChange,
    pageErrors = {},
    onPageErrorsChange,
    onGeneratingPageIdsChange
}: IllustrationsTabContentProps) {
    const router = useRouter()

    // MEMOIZE VISIBLE PAGES to prevent unstable references passed to children
    // Admin sees only Page 1 during trial phase, then all pages after trial approved
    const visiblePages = useMemo(() => {
        const allPagesStatuses = [
            'trial_approved', 'illustrations_generating',
            'sketches_review', 'sketches_revision',
            'illustration_approved', 'completed',
            // Legacy statuses (for migration period)
            'illustration_review', 'illustration_revision_needed'
        ]
        return allPagesStatuses.includes(projectStatus)
            ? pages
            : pages.slice(0, 1)
    }, [pages, projectStatus])

    // Local state for wizard settings (propagated to pages if needed via DB)
    const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || '')
    const [textIntegration, setTextIntegration] = useState(initialTextIntegration || '')
    const [generatingPageIds, setGeneratingPageIds] = useState<Set<string>>(new Set())
    const [loadingState, setLoadingState] = useState<{ [key: string]: { sketch: boolean; illustration: boolean } }>({})
    
    // Batch generation state
    const [batchState, setBatchState] = useState<BatchGenerationState>({
        isRunning: false,
        total: 0,
        completed: 0,
        failed: 0,
        currentPageIds: new Set()
    })
    const batchCancelledRef = useRef(false)
    const MAX_CONCURRENT = 3
    
    // Sync generatingPageIds to parent (for sidebar orange dots)
    useEffect(() => {
        if (onGeneratingPageIdsChange) {
            onGeneratingPageIdsChange(Array.from(generatingPageIds))
        }
    }, [generatingPageIds, onGeneratingPageIdsChange])
    
    // Helper to update page errors (uses external state if provided)
    const setPageError = useCallback((pageId: string, error: GenerationError | null) => {
        if (onPageErrorsChange) {
            onPageErrorsChange(prev => {
                const next = { ...prev }
                if (error) {
                    next[pageId] = error
                } else {
                    delete next[pageId]
                }
                return next
            })
        }
    }, [onPageErrorsChange])

    const handleGenerate = async (page: Page, referenceImageUrl?: string) => {
        try {
            // Clear any previous error for this page
            setPageError(page.id, null)
            
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true, sketch: false } }))

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
        } catch (error: any) {
            const errorMessage = error?.message || 'Generation failed'
            const mappedError = mapErrorToUserMessage(errorMessage)
            
            // Set error state for this page
            setPageError(page.id, mappedError)
            
            toast.error('Generation failed', { description: mappedError.message })
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

    const handleRegenerate = async (
        page: Page, 
        prompt: string, 
        referenceImages?: string[], 
        referenceImageUrl?: string, 
        sceneCharacters?: SceneCharacter[]
    ) => {
        try {
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true } }))

            // Determine if this is Scene Recreation mode
            const isSceneRecreation = !!referenceImageUrl

            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId: page.id,
                    customPrompt: prompt,
                    currentImageUrl: page.illustration_url,
                    referenceImages, // Array of base64 strings (Mode 1/2 only)
                    referenceImageUrl, // Scene Recreation mode (Mode 3/4)
                    sceneCharacters: isSceneRecreation ? sceneCharacters : undefined // Character overrides (Mode 3/4)
                })
            })

            if (!response.ok) throw new Error('Regeneration failed')

            const data = await response.json()
            const successMessage = isSceneRecreation ? 'Scene Recreated!' : 'Illustration Regenerated!'
            toast.success(successMessage, { description: 'Updating sketch...' })

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

    // Generate a single page (for batch use) - returns promise
    const generateSinglePage = async (page: Page): Promise<boolean> => {
        try {
            // Clear any previous error for this page
            setPageError(page.id, null)
            
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: true, sketch: false } }))

            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId: page.id, projectId })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Generation failed')
            }
            
            const data = await response.json()

            // Generate sketch
            if (data.illustrationUrl) {
                setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: true } }))
                await fetch('/api/illustrations/generate-sketch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, pageId: page.id, illustrationUrl: data.illustrationUrl })
                })
            }

            return true
        } catch (error: any) {
            const errorMessage = error?.message || 'Generation failed'
            const mappedError = mapErrorToUserMessage(errorMessage)
            
            // Set error state for this page
            setPageError(page.id, mappedError)
            
            console.error(`Failed to generate page ${page.page_number}:`, error)
            return false
        } finally {
            setGeneratingPageIds(prev => {
                const next = new Set(prev)
                next.delete(page.id)
                return next
            })
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: false } }))
        }
    }

    // Batch generate all remaining pages from a starting page
    const handleGenerateAllRemaining = useCallback(async (startingPage: Page) => {
        // Get pages to generate (from startingPage onwards, without existing illustrations)
        const pagesToGenerate = pages.filter(p => 
            p.page_number >= startingPage.page_number && !p.illustration_url
        )

        if (pagesToGenerate.length === 0) {
            toast.info('No pages to generate')
            return
        }

        // Confirmation dialog
        const confirmed = window.confirm(
            `Generate ${pagesToGenerate.length} illustration${pagesToGenerate.length > 1 ? 's' : ''}?\n\nPages: ${pagesToGenerate.map(p => p.page_number).join(', ')}\n\nThis will run up to ${MAX_CONCURRENT} generations in parallel.`
        )
        if (!confirmed) return

        // Reset cancel flag and start batch
        batchCancelledRef.current = false
        setBatchState({
            isRunning: true,
            total: pagesToGenerate.length,
            completed: 0,
            failed: 0,
            currentPageIds: new Set()
        })

        const queue = [...pagesToGenerate]
        const activePromises: Promise<void>[] = []
        let completed = 0
        let failed = 0

        const processNext = async () => {
            if (batchCancelledRef.current || queue.length === 0) return

            const page = queue.shift()!
            setBatchState(prev => ({
                ...prev,
                currentPageIds: new Set(prev.currentPageIds).add(page.id)
            }))

            const success = await generateSinglePage(page)
            
            if (success) {
                completed++
            } else {
                failed++
            }

            setBatchState(prev => ({
                ...prev,
                completed,
                failed,
                currentPageIds: (() => {
                    const next = new Set(prev.currentPageIds)
                    next.delete(page.id)
                    return next
                })()
            }))

            // Process next in queue if not cancelled
            if (!batchCancelledRef.current && queue.length > 0) {
                await processNext()
            }
        }

        // Start up to MAX_CONCURRENT parallel processes
        for (let i = 0; i < Math.min(MAX_CONCURRENT, pagesToGenerate.length); i++) {
            activePromises.push(processNext())
        }

        // Wait for all to complete
        await Promise.all(activePromises)

        // Refresh UI
        router.refresh()

        // Show completion toast
        if (batchCancelledRef.current) {
            toast.info(`Batch cancelled. Completed: ${completed}, Failed: ${failed}`)
        } else {
            toast.success(`Batch complete! Generated: ${completed}, Failed: ${failed}`)
        }

        setBatchState({
            isRunning: false,
            total: 0,
            completed: 0,
            failed: 0,
            currentPageIds: new Set()
        })
    }, [pages, projectId, router])

    // Cancel batch generation
    const handleCancelBatch = useCallback(() => {
        batchCancelledRef.current = true
        toast.info('Cancelling batch generation...')
    }, [])

    return (
        <UnifiedIllustrationFeed
            mode="admin"
            pages={visiblePages}
            activePageId={activePageId}
            onPageChange={onPageChange}
            projectStatus={projectStatus}
            isAnalyzing={isAnalyzing}
            projectId={projectId}
            characters={characters}

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
            
            // Batch Generation
            allPages={pages}
            onGenerateAllRemaining={handleGenerateAllRemaining}
            onCancelBatch={handleCancelBatch}
            batchState={batchState}
            
            // Error State
            pageErrors={pageErrors}
        />
    )
}
