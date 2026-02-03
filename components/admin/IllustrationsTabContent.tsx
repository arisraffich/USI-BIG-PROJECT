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
// Extracts Google's actual error message when available for relevance
function mapErrorToUserMessage(error: string): { message: string; technicalDetails: string } {
    const lowerError = error.toLowerCase()
    
    // Try to extract Google's actual error message from JSON response
    // Format: "Google API Error: 503 - {"error":{"message":"The model is overloaded..."}}"
    const jsonMatch = error.match(/\{[\s\S]*"message"\s*:\s*"([^"]+)"[\s\S]*\}/)
    const googleMessage = jsonMatch ? jsonMatch[1] : null
    
    // If we have a clear Google message, use it directly (they're usually user-friendly)
    if (googleMessage) {
        return {
            message: googleMessage,
            technicalDetails: error
        }
    }
    
    // Fallback mappings for errors without clear Google messages
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
            message: 'No image was generated - try editing the scene description',
            technicalDetails: error
        }
    }
    if (lowerError.includes('billing') || lowerError.includes('payment') || lowerError.includes('disabled') || lowerError.includes('402')) {
        return {
            message: 'API billing issue - please check your Google Cloud account',
            technicalDetails: error
        }
    }
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
        return {
            message: 'Request timed out - please try again',
            technicalDetails: error
        }
    }
    if (lowerError.includes('network') || lowerError.includes('connection')) {
        return {
            message: 'Network error - please check your connection and try again',
            technicalDetails: error
        }
    }
    
    // Generic fallback - don't assume scene description is the problem
    return {
        message: 'Generation failed - please try again',
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
    // Admin sees only Page 1 until it's generated, then all pages unlock
    const visiblePages = useMemo(() => {
        // Check if page 1 has been generated
        const page1 = pages.find(p => p.page_number === 1)
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
            return pages
        }
        
        // Otherwise, show only page 1 (admin must generate page 1 first)
        return pages.slice(0, 1)
    }, [pages, projectStatus])

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
    }>>({})
    
    // Sync generatingPageIds to parent (for sidebar orange dots)
    useEffect(() => {
        if (onGeneratingPageIdsChange) {
            onGeneratingPageIdsChange(Array.from(generatingPageIds))
        }
    }, [generatingPageIds, onGeneratingPageIdsChange])
    
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
        sceneCharacters?: SceneCharacter[]
    ) => {
        const hasExistingIllustration = !!page.illustration_url
        
        try {
            // Clear any previous error for this page
            setPageError(page.id, null)
            
            setGeneratingPageIds(prev => new Set(prev).add(page.id))
            setLoadingState(prev => ({ ...prev, [page.id]: { ...prev[page.id], illustration: true } }))

            // Auto-download backup if there's an existing illustration
            if (hasExistingIllustration && page.illustration_url) {
                downloadImageBackup(page.illustration_url, page.page_number)
            }

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
                    sceneCharacters: isSceneRecreation ? sceneCharacters : undefined, // Character overrides (Mode 3/4)
                    skipDbUpdate: hasExistingIllustration // Don't save to DB if regenerating (comparison mode)
                })
            })

            if (!response.ok) throw new Error('Regeneration failed')

            const data = await response.json()

            // If regenerating (has existing), enter comparison mode
            if (hasExistingIllustration && data.isPreview) {
                setComparisonStates(prev => ({
                    ...prev,
                    [page.id]: {
                        oldUrl: page.illustration_url!,
                        newUrl: data.illustrationUrl
                    }
                }))
                toast.success('Compare and choose', { description: 'Select which version to keep' })
                setLoadingState(prev => ({ ...prev, [page.id]: { illustration: false, sketch: false } }))
                setGeneratingPageIds(prev => {
                    const next = new Set(prev)
                    next.delete(page.id)
                    return next
                })
                return // Exit here - don't proceed to sketch generation yet
            }

            // First generation (no existing) - proceed normally
            const successMessage = isSceneRecreation ? 'Scene Recreated!' : 'Illustration Generated!'
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
        } catch (error: any) {
            const errorMessage = error?.message || 'Regeneration failed'
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
            toast.error('Regeneration failed', { description: mappedError.message })
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
            } catch (e) {
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
            
            const layoutLabel = newType === 'spread' ? 'Spread' : newType === 'spot' ? 'Spot' : 'Single Page'
            toast.success(`Layout changed to ${layoutLabel}`, { description: 'Generating sketch...' })

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
                    if (sketchRes.ok) {
                        toast.success('Sketch Updated')
                    } else {
                        const errData = await sketchRes.json().catch(() => ({}))
                        console.error("Sketch generation failed:", errData)
                        toast.error('Sketch update failed')
                    }
                } catch (e) {
                    console.error("Sketch trigger failed", e)
                    toast.error('Sketch update failed')
                }
            }
            
            router.refresh()
        } catch (error: any) {
            const errorMessage = error?.message || 'Layout change failed'
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
            toast.error('Layout change failed', { description: mappedError.message })
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
    const handleComparisonDecision = async (pageId: string, decision: 'keep_new' | 'revert_old') => {
        const comparison = comparisonStates[pageId]
        if (!comparison) return
        
        const { oldUrl, newUrl } = comparison
        const page = pages.find(p => p.id === pageId)
        
        // Exit comparison mode IMMEDIATELY so UI switches back to normal view
        setComparisonStates(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
        
        // Set loading state for sketch if keeping new (user sees animation right away)
        if (decision === 'keep_new') {
            setLoadingState(prev => ({ ...prev, [pageId]: { illustration: false, sketch: true } }))
        }
        
        try {
            const response = await fetch('/api/illustrations/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, pageId, projectId, oldUrl, newUrl })
            })
            
            if (!response.ok) throw new Error('Failed to confirm')
            
            const data = await response.json()
            
            if (decision === 'keep_new') {
                toast.success('New illustration confirmed', { description: 'Generating sketch...' })
                
                // Clear admin reply since we're regenerating (addressing feedback with action)
                try {
                    await fetch(`/api/pages/${pageId}/admin-reply`, { method: 'DELETE' })
                } catch (e) {
                    // Non-critical, continue
                }
                
                // Generate sketch for new illustration
                try {
                    const sketchRes = await fetch('/api/illustrations/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, pageId, illustrationUrl: newUrl })
                    })
                    if (sketchRes.ok) {
                        toast.success('Sketch Updated')
                    } else {
                        toast.error('Sketch update failed')
                    }
                } catch (e) {
                    toast.error('Sketch update failed')
                }
            } else {
                toast.success('Reverted to previous illustration')
            }
            
            router.refresh()
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to confirm decision'
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(pageId, mappedError)
            toast.error('Failed to confirm decision', { description: mappedError.message })
            console.error(error)
        } finally {
            setLoadingState(prev => ({ ...prev, [pageId]: { illustration: false, sketch: false } }))
        }
    }

    const handleUpload = async (page: Page, type: 'sketch' | 'illustration', file: File) => {
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

                } catch (sketchError: any) {
                    const errorMessage = sketchError?.message || 'Failed to auto-generate sketch'
                    const mappedError = mapErrorToUserMessage(errorMessage)
                    setPageError(page.id, mappedError)
                    console.error("Auto-sketch failed", sketchError)
                    toast.error('Failed to auto-generate sketch', { description: mappedError.message })
                }
            }

        } catch (error: any) {
            const errorMessage = error?.message || 'Upload failed'
            const mappedError = mapErrorToUserMessage(errorMessage)
            setPageError(page.id, mappedError)
            toast.error('Upload failed', { description: mappedError.message })
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
            allPages={pages}
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
        />
    )
}
