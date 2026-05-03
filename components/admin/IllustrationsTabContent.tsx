import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Cover } from '@/types/cover'
import { createClient } from '@/lib/supabase/client'
import { UnifiedIllustrationFeed } from '@/components/illustration/UnifiedIllustrationFeed'
import { SceneCharacter } from '@/components/illustration/SharedIllustrationBoard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'

import { useRouter } from 'next/navigation'
import { getErrorMessage } from '@/lib/utils/error'
import { mapErrorToUserMessage } from '@/lib/utils/generation-errors'
import type { ImageTuneSettings } from '@/types/image-tune'

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

interface PendingIllustrationUpload {
    page: Page
    file: File
}

// GenerationError type matches MappedError from shared utility
// (message + technicalDetails used throughout this component)

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
    onComparisonPageIdsChange?: (pageIds: string[]) => void
    onSketchGeneratingPageIdsChange?: (pageIds: string[]) => void
    
    // Page Delete Feature (ref shared with sidebar via parent)
    deletePageHandlerRef?: React.MutableRefObject<((pageId: string) => void) | null>
    onDeleteDisabledChange?: (disabled: boolean) => void

    // Cover Module — hide "Create Cover" once a cover exists; propagate up on creation.
    hasCover?: boolean
    onCoverCreated?: (cover: Cover) => void
}

function preloadComparisonImage(url: string): Promise<void> {
    return new Promise(resolve => {
        const image = new Image()
        image.onload = () => {
            if (image.decode) {
                image.decode().catch(() => undefined).finally(resolve)
                return
            }
            resolve()
        }
        image.onerror = () => resolve()
        image.src = url
    })
}

async function preloadComparisonImages(oldUrl: string, newUrl: string): Promise<void> {
    await Promise.all([
        preloadComparisonImage(oldUrl),
        preloadComparisonImage(newUrl),
    ])
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
    onGeneratingPageIdsChange,
    onComparisonPageIdsChange,
    onSketchGeneratingPageIdsChange,
    deletePageHandlerRef,
    onDeleteDisabledChange,
    hasCover = false,
    onCoverCreated,
}: IllustrationsTabContentProps) {
    const router = useRouter()
    const [optimisticIllustrationUrls, setOptimisticIllustrationUrls] = useState<Record<string, string>>({})

    const pagesWithOptimisticIllustrations = useMemo(() => {
        return pages.map(page => {
            const illustrationUrl = optimisticIllustrationUrls[page.id]
            return illustrationUrl
                ? { ...page, illustration_url: illustrationUrl, original_illustration_url: illustrationUrl }
                : page
        })
    }, [pages, optimisticIllustrationUrls])

    useEffect(() => {
        setOptimisticIllustrationUrls(prev => {
            const next: Record<string, string> = {}
            const pagesById = new Map(pages.map(page => [page.id, page]))

            for (const [pageId, illustrationUrl] of Object.entries(prev)) {
                const page = pagesById.get(pageId)
                if (page && page.illustration_url !== illustrationUrl) {
                    next[pageId] = illustrationUrl
                }
            }

            return Object.keys(next).length === Object.keys(prev).length ? prev : next
        })
    }, [pages])

    // MEMOIZE VISIBLE PAGES to prevent unstable references passed to children
    // Admin sees only Page 1 until it's generated, then all pages unlock
    const visiblePages = useMemo(() => {
        // Check if page 1 has been generated
        const page1 = pagesWithOptimisticIllustrations.find(p => p.page_number === 1)
        const page1Generated = !!page1?.illustration_url
        
        // Status-based logic (for review/revision/approved phases, always show all)
        const allPagesStatuses = [
            'sketches_review', 'sketches_revision',
            'illustration_approved', 'completed',
            // Legacy statuses (for migration period)
            'trial_approved', 'illustrations_generating',
            'illustration_review', 'illustration_revision_needed'
        ]
        
        // Show all pages if:
        // 1. Status is in a phase where all pages should be visible, OR
        // 2. Page 1 has been generated (admin can now generate rest)
        if (allPagesStatuses.includes(projectStatus) || page1Generated) {
            return pagesWithOptimisticIllustrations
        }
        
        // Otherwise, show only page 1 (admin must generate page 1 first)
        return pagesWithOptimisticIllustrations.slice(0, 1)
    }, [pagesWithOptimisticIllustrations, projectStatus])

    // Local state for wizard settings (propagated to pages if needed via DB)
    const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || '')
    
    // Per-page text integration state (keyed by page id)
    // Initialize from pages data or use project default
    const [pageTextIntegration, setPageTextIntegration] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {}
        pages.forEach(p => {
            // Use page's saved value, or fall back to project default
            initial[p.id] = p.text_integration || initialTextIntegration || ''
        })
        return initial
    })
    
    // Per-page illustration type state (keyed by page id): 'spread' | 'spot' | null (normal)
    const [pageIllustrationType, setPageIllustrationType] = useState<Record<string, 'spread' | 'spot' | null>>(() => {
        const initial: Record<string, 'spread' | 'spot' | null> = {}
        pages.forEach(p => {
            // Support both new illustration_type and legacy is_spread
            initial[p.id] = p.illustration_type || (p.is_spread ? 'spread' : null)
        })
        return initial
    })
    
    const [generatingPageIds, setGeneratingPageIds] = useState<Set<string>>(new Set())
    const [loadingState, setLoadingState] = useState<{ [key: string]: { sketch: boolean; illustration: boolean } }>({})
    const [pendingIllustrationUpload, setPendingIllustrationUpload] = useState<PendingIllustrationUpload | null>(null)
    const [regenerateSketchAfterUpload, setRegenerateSketchAfterUpload] = useState(false)
    
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
    
    // Comparison mode state (for regeneration preview) - Map supports parallel comparisons
    const [comparisonStates, setComparisonStates] = useState<Record<string, {
        oldUrl: string
        newUrl: string
        isRefresh?: boolean
        isAutoTune?: boolean
    }>>({})
    
    // Sync generatingPageIds to parent (for sidebar orange dots)
    useEffect(() => {
        if (onGeneratingPageIdsChange) {
            onGeneratingPageIdsChange(Array.from(generatingPageIds))
        }
    }, [generatingPageIds, onGeneratingPageIdsChange])
    
    // Sync comparisonStates to parent (for sidebar comparison indicator)
    useEffect(() => {
        if (onComparisonPageIdsChange) {
            onComparisonPageIdsChange(Object.keys(comparisonStates))
        }
    }, [comparisonStates, onComparisonPageIdsChange])
    
    // Sync sketch-generating page IDs to parent (for sidebar gray dots)
    useEffect(() => {
        if (onSketchGeneratingPageIdsChange) {
            const sketchPages = Object.entries(loadingState)
                .filter(([, state]) => state.sketch)
                .map(([pageId]) => pageId)
            onSketchGeneratingPageIdsChange(sketchPages)
        }
    }, [loadingState, onSketchGeneratingPageIdsChange])
    
    // Sync per-page state when pages prop changes (e.g., new pages added)
    useEffect(() => {
        setPageTextIntegration(prev => {
            const updated = { ...prev }
            pages.forEach(p => {
                if (!(p.id in updated)) {
                    updated[p.id] = p.text_integration || initialTextIntegration || ''
                }
            })
            return updated
        })
        setPageIllustrationType(prev => {
            const updated = { ...prev }
            pages.forEach(p => {
                if (!(p.id in updated)) {
                    // Support both new illustration_type and legacy is_spread
                    updated[p.id] = p.illustration_type || (p.is_spread ? 'spread' : null)
                }
            })
            return updated
        })
    }, [pages, initialTextIntegration])
    
    // Handler for setting text integration per page
    const handleSetPageTextIntegration = useCallback((pageId: string, value: string) => {
        setPageTextIntegration(prev => ({ ...prev, [pageId]: value }))
    }, [])
    
    // Handler for setting illustration type per page (spread, spot, or null for normal)
    // Handles mutual exclusivity and auto text integration behavior
    const handleSetPageIllustrationType = useCallback((pageId: string, type: 'spread' | 'spot' | null) => {
        setPageIllustrationType(prev => ({ ...prev, [pageId]: type }))
        
        // Auto-select 'integrated' text when spread is enabled
        if (type === 'spread') {
            setPageTextIntegration(prev => ({ ...prev, [pageId]: 'integrated' }))
        }
        // Note: Spot disables text integration (handled in UI by graying out the option)
    }, [])
    
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
            
            // 1. Save project-level aspect ratio (locked by Page 1)
            await supabase.from('projects').update({
                illustration_aspect_ratio: aspectRatio,
                illustration_text_integration: pageTextIntegration[page.id] || '' // Also update project default
            }).eq('id', projectId)
            
            // 2. Save per-page settings (text_integration and illustration_type)
            const pageSettings: { text_integration?: string; illustration_type?: string | null } = {}
            if (pageTextIntegration[page.id]) {
                pageSettings.text_integration = pageTextIntegration[page.id]
            }
            // Save illustration_type (null for normal, 'spread' for spread, 'spot' for spot)
            pageSettings.illustration_type = pageIllustrationType[page.id] || null
            if (Object.keys(pageSettings).length > 0) {
                await supabase.from('pages').update(pageSettings).eq('id', page.id)
            }

            // 3. Trigger Generation (API)
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
            // 3. Chain: Generate Sketch Immediately
            if (data.illustrationUrl) {
                try {
                    setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: false, sketch: true } }))
                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, pageId: page.id, illustrationUrl: data.illustrationUrl })
                    })
                    if (sketchRes.ok) {                    } else {
                        const errData = await sketchRes.json().catch(() => ({}))
                        console.error("Sketch generation failed:", errData)                    }
                } catch (e) {
                    console.error("Sketch trigger failed", e)                }
            }
            
            // Refresh AFTER sketch generation to update UI with both illustration and sketch
            router.refresh()
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Generation failed')
            const mappedError = mapErrorToUserMessage(errorMessage)
            
            // Set error state for this page
            setPageError(page.id, mappedError)
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

    // Helper to download image as backup
    const downloadImageBackup = async (url: string, pageNumber: number) => {
        try {
            const response = await fetch(url)
            const blob = await response.blob()
            const downloadUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            link.download = `Page-${pageNumber}-backup-${new Date().toISOString().split('T')[0]}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(downloadUrl)
        } catch (e) {
            console.warn('Failed to download backup:', e)
        }
    }

    const handleRegenerate = async (
        page: Page, 
        prompt: string, 
        referenceImages?: string[], 
        referenceImageUrl?: string, 
        sceneCharacters?: SceneCharacter[],
        useThinking?: boolean,
        modelId?: string,
        isRefresh?: boolean
    ) => {
        const hasExistingIllustration = !!page.illustration_url
        
        try {
            // Clear any previous error for this page
            setPageError(page.id, null)
            
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true } }))

            if (isRefresh) {
                console.log(`[Refresh] Page ${page.page_number} model=${modelId || 'nb2'}`)            }

            // Auto-download backup if there's an existing illustration
            if (hasExistingIllustration && page.illustration_url) {
                downloadImageBackup(page.illustration_url, page.page_number)
            }

            // Determine if this is Scene Recreation mode
            const isSceneRecreation = !isRefresh && !!referenceImageUrl

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
                    sceneCharacters: isSceneRecreation ? sceneCharacters : undefined, // Character overrides (Mode 3/4)
                    skipDbUpdate: hasExistingIllustration, // Don't save to DB if regenerating (comparison mode)
                    useThinking: useThinking || false,
                    modelId,
                    isRefresh: isRefresh || false
                })
            })

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}))
                const serverMsg = errData?.error || 'Regeneration failed'
                throw new Error(serverMsg)
            }

            const data = await response.json()

            // If regenerating (has existing), enter comparison mode
            if (hasExistingIllustration && data.isPreview) {
                await preloadComparisonImages(page.illustration_url!, data.illustrationUrl)
                setComparisonStates(prev => ({
                    ...prev,
                    [page.id]: {
                        oldUrl: page.illustration_url!,
                        newUrl: data.illustrationUrl,
                        isRefresh: Boolean(data.isRefresh || isRefresh)
                    }
                }))
                setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: false } }))
                setGeneratingPageIds(prev => {
                    const next = new Set(prev)
                    next.delete(page.id)
                    return next
                })
                return // Exit here - don't proceed to sketch generation yet
            }

            // First generation (no existing) - proceed normally
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
                    if (sketchRes.ok) {                    } else {
                        const errData = await sketchRes.json().catch(() => ({}))
                        console.error("Sketch regeneration failed:", errData)                    }
                } catch (e) {
                    console.error("Sketch trigger failed", e)
                }
            }
            
            // Refresh AFTER sketch generation to update UI with both illustration and sketch
            router.refresh()
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Regeneration failed')
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
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

    const handleAutoTune = async (page: Page, settings: ImageTuneSettings) => {
        if (!page.illustration_url) return

        try {
            setPageError(page.id, null)
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true } }))
            const response = await fetch('/api/illustrations/auto-tune', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'apply',
                    projectId,
                    pageId: page.id,
                    settings,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Auto tune failed')
            }

            const data = await response.json()

            await preloadComparisonImages(page.illustration_url!, data.illustrationUrl)
            setComparisonStates(prev => ({
                ...prev,
                [page.id]: {
                    oldUrl: page.illustration_url!,
                    newUrl: data.illustrationUrl,
                    isRefresh: true,
                    isAutoTune: true,
                },
            }))
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Auto tune failed')
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
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

    // Handle layout change (triggers direct regeneration, no comparison mode)
    const handleLayoutChange = async (page: Page, newType: 'spread' | 'spot' | null) => {
        try {
            // Clear any previous error for this page
            setPageError(page.id, null)
            
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: true, sketch: false } }))

            // Auto-download backup if there's an existing illustration
            if (page.illustration_url) {
                downloadImageBackup(page.illustration_url, page.page_number)
            }

            const supabase = createClient()
            
            // 1. Save new layout type to database
            const pageSettings: { illustration_type: string | null; text_integration?: string } = {
                illustration_type: newType
            }
            
            // Auto-set text_integration to 'integrated' when switching to spread
            if (newType === 'spread') {
                pageSettings.text_integration = 'integrated'
                // Also update local state
                setPageTextIntegration(prev => ({ ...prev, [page.id]: 'integrated' }))
            }
            
            await supabase.from('pages').update(pageSettings).eq('id', page.id)
            
            // Update local state for illustration type
            setPageIllustrationType(prev => ({ ...prev, [page.id]: newType }))

            // Clear admin reply since we're regenerating (addressing feedback with action)
            try {
                await fetch(`/api/pages/${page.id}/admin-reply`, { method: 'DELETE' })
            } catch {
                // Non-critical, continue
            }

            // 2. Trigger regeneration (no comparison mode - direct replacement)
            const response = await fetch('/api/illustrations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    pageId: page.id,
                    skipDbUpdate: false // Save to DB directly (no comparison mode)
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Layout change failed')
            }

            const data = await response.json()
            
            // Unlock Illustration, Lock Sketch
            setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: true } }))

            // 3. Chain: Generate Sketch
            if (data.illustrationUrl) {
                try {
                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, pageId: page.id, illustrationUrl: data.illustrationUrl })
                    })
                    if (sketchRes.ok) {                    } else {
                        const errData = await sketchRes.json().catch(() => ({}))
                        console.error("Sketch generation failed:", errData)                    }
                } catch (e) {
                    console.error("Sketch trigger failed", e)
                }
            }
            
            router.refresh()
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Layout change failed')
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
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

    // Handle comparison decision (Keep New or Revert Old)
    const handleComparisonDecision = async (pageId: string, decision: 'keep_new' | 'revert_old' | 'keep_editing') => {
        const comparison = comparisonStates[pageId]
        if (!comparison) return
        
        const { oldUrl, newUrl, isRefresh } = comparison
        if (decision === 'keep_new') {
            setOptimisticIllustrationUrls(prev => ({ ...prev, [pageId]: newUrl }))
        }

        // Exit comparison mode IMMEDIATELY so UI switches back to normal view
        setComparisonStates(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
        
        // Set loading state for sketch if keeping new (user sees animation right away)
        if (decision === 'keep_new' && !isRefresh) {
            setLoadingState(prev => ({ ...prev, [pageId]: { illustration: false, sketch: true } }))
        }
        
        try {
            const apiDecision = decision === 'keep_editing' ? 'revert_old' : decision
            const response = await fetch('/api/illustrations/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: apiDecision, pageId, projectId, oldUrl, newUrl, isRefresh })
            })
            
            if (!response.ok) throw new Error('Failed to confirm')

            if (decision === 'keep_editing') {
                return
            }
            
            if (decision === 'keep_new') {
                if (isRefresh) {
                    router.refresh()
                    return
                }

                router.refresh()
                
                // Clear admin reply since we're regenerating (addressing feedback with action)
                try {
                    await fetch(`/api/pages/${pageId}/admin-reply`, { method: 'DELETE' })
                } catch {
                    // Non-critical, continue
                }
                
                // Generate sketch for new illustration
                try {
                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, pageId, illustrationUrl: newUrl })
                    })
                    if (!sketchRes.ok) {
                        console.error('Failed to generate sketch for confirmed illustration:', sketchRes.statusText)
                    }
                } catch (error) {
                    console.error('Failed to generate sketch for confirmed illustration:', error)
                }
            }
            
            router.refresh()
        } catch (error: unknown) {
            if (decision === 'keep_new') {
                setOptimisticIllustrationUrls(prev => {
                    const next = { ...prev }
                    delete next[pageId]
                    return next
                })
            }
            const errorMessage = getErrorMessage(error, 'Failed to confirm decision')
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(pageId, mappedError)
            console.error(error)
        } finally {
            setLoadingState(prev => ({ ...prev, [pageId]: { illustration: false, sketch: false } }))
        }
    }

    const executeUpload = async (page: Page, type: 'sketch' | 'illustration', file: File, regenerateSketch: boolean) => {
        try {
            // Clear any previous error for this page
            setPageError(page.id, null)
            
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

            const response = await fetch('/api/illustrations/upload', { method: 'POST', body: formData })
            const result = await response.json()
            if (!result.success) throw new Error(result.error || 'Upload failed')
            // Always refresh after successful upload to update is_resolved state
            router.refresh()

            // Optional sketch regeneration after a colored illustration upload.
            if (type === 'illustration' && regenerateSketch && result.url) {
                try {
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
                    router.refresh()

                } catch (sketchError: unknown) {
                    const errorMessage = getErrorMessage(sketchError, 'Failed to auto-generate sketch')
                    const mappedError = mapErrorToUserMessage(errorMessage)
                    setPageError(page.id, mappedError)
                    console.error("Auto-sketch failed", sketchError)
                }
            }

        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Upload failed')
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
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

    const handleUpload = async (page: Page, type: 'sketch' | 'illustration', file: File) => {
        if (type === 'illustration') {
            setRegenerateSketchAfterUpload(false)
            setPendingIllustrationUpload({ page, file })
            return
        }

        await executeUpload(page, type, file, false)
    }

    const handleConfirmIllustrationUpload = async (regenerateSketch: boolean) => {
        if (!pendingIllustrationUpload) return
        const upload = pendingIllustrationUpload
        setPendingIllustrationUpload(null)
        setRegenerateSketchAfterUpload(false)
        await executeUpload(upload.page, 'illustration', upload.file, regenerateSketch)
    }

    // Generate a single page (for batch use) - returns promise
    const generateSinglePage = useCallback(async (page: Page): Promise<boolean> => {
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
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Generation failed')
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
    }, [projectId, setPageError])

    // Batch generate all remaining pages from a starting page
    const handleGenerateAllRemaining = useCallback(async (startingPage: Page) => {
        // Get pages to generate (from startingPage onwards, without existing illustrations)
        const pagesToGenerate = pages.filter(p => 
            p.page_number >= startingPage.page_number && !p.illustration_url
        )

        if (pagesToGenerate.length === 0) {
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

        setBatchState({
            isRunning: false,
            total: 0,
            completed: 0,
            failed: 0,
            currentPageIds: new Set()
        })
    }, [pages, router, generateSinglePage])

    // Cancel batch generation
    const handleCancelBatch = useCallback(() => {
        batchCancelledRef.current = true    }, [])

    // Handle admin reply to customer feedback
    const handleSaveAdminReply = useCallback(async (pageId: string, reply: string) => {
        const response = await fetch(`/api/pages/${pageId}/admin-reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_reply: reply, type: 'reply' }),
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Failed to save reply')
        }

        // Refresh to show updated page with admin_reply
        router.refresh()
    }, [router])

    // Handle edit admin reply
    const handleEditAdminReply = useCallback(async (pageId: string, reply: string) => {
        const response = await fetch(`/api/pages/${pageId}/admin-reply`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_reply: reply }),
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Failed to edit reply')
        }

        router.refresh()
    }, [router])

    // Handle add comment on resolved revision
    const handleAddComment = useCallback(async (pageId: string, comment: string) => {
        const response = await fetch(`/api/pages/${pageId}/admin-reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_reply: comment, type: 'comment' }),
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Failed to add comment')
        }

        router.refresh()
    }, [router])

    // Handle remove comment
    const handleRemoveComment = useCallback(async (pageId: string) => {
        const response = await fetch(`/api/pages/${pageId}/admin-reply`, {
            method: 'DELETE',
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Failed to remove comment')
        }

        router.refresh()
    }, [router])

    // -----------------------------------------------------------------------
    // PAGE DELETE FEATURE
    // FUTURE: "Add Page" — mirror this pattern. Create handleAddPageRequest()
    // that shows a dialog to choose insert position (before/after current page).
    // Call a POST /api/pages endpoint that inserts a blank page and uses
    // renumberPagesAfterInsert() to shift subsequent page_numbers up by 1.
    // -----------------------------------------------------------------------
    const [deleteTargetPage, setDeleteTargetPage] = useState<Page | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDeletePageRequest = useCallback((pageId: string) => {
        const page = pages.find(p => p.id === pageId)
        if (page) setDeleteTargetPage(page)
    }, [pages])

    const handleConfirmDelete = useCallback(async () => {
        if (!deleteTargetPage) return
        setIsDeleting(true)

        try {
            const response = await fetch(`/api/pages/${deleteTargetPage.id}`, { method: 'DELETE' })

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || 'Failed to delete page')
            }

            const result = await response.json()
            const deletedNumber = result.deletedPageNumber

            setDeleteTargetPage(null)

            // Navigate to the previous page (or the new first page)
            const remainingPages = pages.filter(p => p.id !== deleteTargetPage.id)
            if (remainingPages.length > 0 && onPageChange) {
                const prevPage = remainingPages.find(p => p.page_number < deletedNumber)
                    ? [...remainingPages].reverse().find(p => p.page_number < deletedNumber)
                    : remainingPages[0]
                if (prevPage) onPageChange(prevPage.id)
            }

            router.refresh()
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, 'Failed to delete page')
            console.error('[Page Delete]', errorMessage, error)
        } finally {
            setIsDeleting(false)
        }
    }, [deleteTargetPage, pages, onPageChange, router])

    const isDeleteDisabled = batchState.isRunning || generatingPageIds.size > 0

    // -----------------------------------------------------------------------
    // SKETCH/STORY TOGGLE — "All Pages" broadcast
    // -----------------------------------------------------------------------
    const [globalSketchViewMode, setGlobalSketchViewMode] = useState<{ mode: 'sketch' | 'text'; version: number }>({ mode: 'sketch', version: 0 })

    const handleToggleAllSketchView = useCallback((mode: 'sketch' | 'text') => {
        setGlobalSketchViewMode(prev => ({ mode, version: prev.version + 1 }))
    }, [])

    // Sync delete handler and disabled state with parent (for sidebar access)
    useEffect(() => {
        if (deletePageHandlerRef) {
            deletePageHandlerRef.current = handleDeletePageRequest
        }
    }, [handleDeletePageRequest, deletePageHandlerRef])

    useEffect(() => {
        onDeleteDisabledChange?.(isDeleteDisabled)
    }, [isDeleteDisabled, onDeleteDisabledChange])

    // Handle manual resolve
    const handleManualResolve = useCallback(async (pageId: string) => {
        const response = await fetch(`/api/pages/${pageId}/resolve`, {
            method: 'POST',
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Failed to resolve revision')
        }

        router.refresh()
    }, [router])

    return (
        <>
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
                onAutoTune={handleAutoTune}
                onLayoutChange={handleLayoutChange}
                onUpload={handleUpload}

                // Wizard State
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                generatingPageIds={generatingPageIds}
                loadingStateMap={loadingState}
                
                // Per-page settings
                pageTextIntegration={pageTextIntegration}
                setPageTextIntegration={handleSetPageTextIntegration}
                pageIllustrationType={pageIllustrationType}
                setPageIllustrationType={handleSetPageIllustrationType}
                
                // Batch Generation
                allPages={pagesWithOptimisticIllustrations}
                onGenerateAllRemaining={handleGenerateAllRemaining}
                onCancelBatch={handleCancelBatch}
                batchState={batchState}
                
                // Error State
                pageErrors={pageErrors}
                
                // Comparison Mode (Regeneration Preview)
                comparisonStates={comparisonStates}
                onComparisonDecision={handleComparisonDecision}
                
                // Admin Reply Feature
                onSaveAdminReply={handleSaveAdminReply}
                onEditAdminReply={handleEditAdminReply}
                onAddComment={handleAddComment}
                onRemoveComment={handleRemoveComment}
                onManualResolve={handleManualResolve}

                // Sketch/Story Toggle "All Pages"
                globalSketchViewMode={globalSketchViewMode}
                onToggleAllSketchView={handleToggleAllSketchView}

                // Cover Module
                hasCover={hasCover}
                onCoverCreated={onCoverCreated}
            />

            {/* COLORED ILLUSTRATION UPLOAD OPTIONS */}
            <Dialog
                open={!!pendingIllustrationUpload}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingIllustrationUpload(null)
                        setRegenerateSketchAfterUpload(false)
                    }
                }}
            >
                <DialogContent className="sm:max-w-[430px]">
                    <DialogHeader>
                        <DialogTitle>Upload Colored Illustration</DialogTitle>
                        <DialogDescription>
                            Page {pendingIllustrationUpload?.page.page_number}
                        </DialogDescription>
                    </DialogHeader>

                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-800">
                        <input
                            type="checkbox"
                            checked={regenerateSketchAfterUpload}
                            onChange={(event) => setRegenerateSketchAfterUpload(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                        />
                        Regenerate sketch too
                    </label>

                    <DialogFooter>
                        <Button
                            className="w-full"
                            onClick={() => handleConfirmIllustrationUpload(regenerateSketchAfterUpload)}
                        >
                            Upload Illustration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PAGE DELETE CONFIRMATION DIALOG */}
            <Dialog open={!!deleteTargetPage} onOpenChange={(open) => { if (!open) setDeleteTargetPage(null) }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Delete Page {deleteTargetPage?.page_number}?</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Remaining pages will be renumbered automatically.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-2">
                        {/* Warning: has illustration */}
                        {deleteTargetPage?.illustration_url && (
                            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>This page has a generated illustration that will be permanently deleted.</span>
                            </div>
                        )}

                        {/* Warning: has unresolved feedback */}
                        {deleteTargetPage?.feedback_notes && !deleteTargetPage?.is_resolved && (
                            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>This page has unresolved customer feedback.</span>
                            </div>
                        )}

                        {/* Info: story text will be available */}
                        {deleteTargetPage?.story_text?.trim() && (
                            <p className="text-sm text-slate-500">
                                The story text will be shown after deletion so you can copy it to an adjacent page if needed.
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteTargetPage(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
