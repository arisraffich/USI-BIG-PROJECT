'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { CustomerIllustrationReview } from './CustomerIllustrationReview'
import { UnifiedIllustrationFeed } from '@/components/illustration/UnifiedIllustrationFeed'
import { UnifiedIllustrationSidebar } from '@/components/illustration/UnifiedIllustrationSidebar'
import { CustomerAddCharacterButton } from './CustomerAddCharacterButton'
import { CustomerManuscriptEditor } from './CustomerManuscriptEditor'
import { CustomerProjectHeader } from './CustomerProjectHeader'
import { SubmissionSuccessScreen } from './SubmissionSuccessScreen'
import { SubmissionStatusModal } from './SubmissionStatusModal'
import { CustomerCharacterGallery } from './CustomerCharacterGallery'
import { CustomerCharacterCard } from './CustomerCharacterCard'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Send, Check, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { UnifiedProjectLayout } from '@/components/layout/UnifiedProjectLayout'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/utils/error'

interface CustomerProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus: string
  reviewToken: string
  projectTitle: string
  authorName: string
  characterSendCount: number
  illustrationSendCount: number
  showColoredToCustomer?: boolean
}

export function CustomerProjectTabsContent({
  projectId,
  pages,
  characters,
  projectStatus,
  reviewToken,
  projectTitle,
  authorName,
  characterSendCount,
  illustrationSendCount,
  showColoredToCustomer = false
}: CustomerProjectTabsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [showApproveWarningDialog, setShowApproveWarningDialog] = useState(false)
  // Lifted state for Edit Mode to coordinate Header and Editor
  const [isEditMode, setIsEditMode] = useState(false)
  
  // Completion popup state
  const [showCompletionPopup, setShowCompletionPopup] = useState(false)
  const popupDismissedKey = `character-forms-popup-dismissed-${projectId}`

  // Local project status state for realtime updates
  const [localProjectStatus, setLocalProjectStatus] = useState(projectStatus)
  
  // Track send count and sync project status from props
  const lastSendCount = useRef(characterSendCount)
  const latestProjectStatus = useRef(projectStatus)

  useEffect(() => {
    lastSendCount.current = characterSendCount
  }, [characterSendCount])

  useEffect(() => {
    setLocalProjectStatus(projectStatus)
    latestProjectStatus.current = projectStatus
  }, [projectStatus])

  // Illustration Feedback State
  const [illustrationEdits, setIllustrationEdits] = useState<{ [pageId: string]: string }>({})

  // Local state for pages to support instant realtime updates
  const [localPages, setLocalPages] = useState<Page[]>(pages || [])
  const [activeIllustrationPageId, setActiveIllustrationPageId] = useState<string | null>(pages?.[0]?.id || null)

  // Sync local state when server props update, but respect newer local versions (from realtime)
  useEffect(() => {
    if (pages) {
      setLocalPages(currentLocal => {
        // If we have no local state yet, just take server state
        if (currentLocal.length === 0) return pages

        // Merge strategy: Keep local version if it's newer (from realtime) than the incoming server prop (potentially stale)
        return pages.map(serverPage => {
          const localPage = currentLocal.find(p => p.id === serverPage.id)

          // Check if local page exists and has a valid updated_at timestamp that is newer than server's
          if (localPage?.updated_at && serverPage.updated_at) {
            const localTime = new Date(localPage.updated_at).getTime()
            const serverTime = new Date(serverPage.updated_at).getTime()

            // If local state is ahead of server state (race condition), keep local
            if (localTime > serverTime) {
              return localPage
            }
          }

          // Otherwise trust server state
          return serverPage
        })
      })
    }
  }, [pages])

  // Realtime Subscription for pages
  useEffect(() => {
    const supabase = createClient()
    const channelName = `customer-project-pages-${projectId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pages',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          // 1. Instant Local Update
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedPage = payload.new as Page

            setLocalPages(prev => prev.map(p => p.id === updatedPage.id ? { ...p, ...updatedPage } : p))

            toast.info('Page content updated', {
              description: 'The author has modified the manuscript.'
            })
          } else if (payload.eventType === 'INSERT' && payload.new) {
            setLocalPages(prev => [...prev, payload.new as Page])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Realtime Subscription for project status
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`project-status-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`
        },
        (payload) => {
          const newProject = payload.new as any
          const currentStatus = latestProjectStatus.current

          setLocalProjectStatus(newProject.status)
          latestProjectStatus.current = newProject.status

          const wasHidden = ['character_generation', 'character_generation_complete'].includes(currentStatus)
          const isNowVisible = ['character_review', 'character_revision_needed', 'characters_approved'].includes(newProject.status)

          if (wasHidden && isNowVisible) {
            toast.success("New Updates Available!", {
              description: "The author has shared new updates with you."
            })
          }

          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Local state for characters to support instant realtime updates
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters || [])

  // Sync local characters when server props update
  useEffect(() => {
    if (characters) {
      setLocalCharacters(characters)
    }
  }, [characters])

  // Customer polling - ONLY when waiting for generation to complete
  // DO NOT poll during character_review (customer is filling forms - polling would reset their input!)
  useEffect(() => {
    // Poll ONLY when status is character_generation_complete
    if (localProjectStatus !== 'character_generation_complete') return

    const interval = setInterval(() => {
      router.refresh()
    }, 3000)

    return () => clearInterval(interval)
  }, [localProjectStatus, router])

  // Realtime Subscription for characters
  useEffect(() => {
    const supabase = createClient()
    const channelName = `customer-project-characters-${projectId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events
          schema: 'public',
          table: 'characters',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log('[Customer Characters] Realtime update received:', payload.eventType, payload.new)
          
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedChar = payload.new as Character
            
            setLocalCharacters(prev => {
              const updated = prev.map(c => c.id === updatedChar.id ? { ...c, ...updatedChar } : c)
              console.log('[Customer Characters] Local state updated:', updated)
              return updated
            })
            
            // If character has customer_image_url, trigger notification and refresh
            if (updatedChar.customer_image_url) {
              console.log('[Customer Characters] Customer image URL detected, refreshing...')
              toast.success('Character illustrations updated!', {
                description: 'Gallery is now available.'
              })
              // Delay refresh slightly to ensure state updates propagate
              setTimeout(() => {
                router.refresh()
              }, 500)
            }
          } else if (payload.eventType === 'INSERT' && payload.new) {
            setLocalCharacters(prev => [...prev, payload.new as Character])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Store manuscript editor edits
  const [manuscriptEdits, setManuscriptEdits] = useState<{ [pageId: string]: { story_text?: string; scene_description?: string } }>({})

  // Store character form data and validity
  const [characterForms, setCharacterForms] = useState<{ [id: string]: { data: any; isValid: boolean } }>({})

  // Initialize character forms from props on mount (fix for manually added characters having disabled submit button)
  useEffect(() => {
    if (localCharacters && localCharacters.length > 0) {
      const initialForms: Record<string, { data: any; isValid: boolean }> = {}

      localCharacters.forEach(char => {
        // Only initialize if not main character (as main is read-only here)
        if (!char.is_main) {
          // Basic validation: needs name, age, gender. 
          // If manual add, these should exist.
          const isValid = !!(char.name && char.age && char.gender)
          initialForms[char.id] = { data: char, isValid }
        }
      })

      // Only set if not already populated (to avoid overwriting user edits on re-render)
      setCharacterForms(prev => {
        if (Object.keys(prev).length === 0 && Object.keys(initialForms).length > 0) {
          return initialForms
        }
        return prev
      })
    }
  }, [localCharacters])

  const handleCharacterChange = useCallback((id: string, data: any, isValid: boolean) => {
    setCharacterForms(prev => ({
      ...prev,
      [id]: { data, isValid }
    }))
  }, [])

  // Read active tab directly from search params
  const activeTab = useMemo(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'pages') return 'pages'
    if (tab === 'characters') return 'characters'
    if (tab === 'illustrations' || tab === 'illustations') return 'illustrations'
    return 'pages'
  }, [searchParams])

  // Helper to check if a character's form is complete (based on saved database data)
  const isCharacterFormComplete = useCallback((char: Character): boolean => {
    return !!(
      char.age?.trim() &&
      char.gender?.trim() &&
      char.skin_color?.trim() &&
      char.hair_color?.trim() &&
      char.hair_style?.trim() &&
      char.eye_color?.trim() &&
      (char.clothing?.trim() || char.accessories?.trim() || char.special_features?.trim())
    )
  }, [])

  // Sort characters: main character first, then secondary by creation date
  const sortedCharacters = useMemo(() => {
    if (!localCharacters) return { main: null, secondary: [] }

    const sorted = [...localCharacters].sort((a, b) => {
      if (a.is_main && !b.is_main) return -1
      if (!a.is_main && b.is_main) return 1
      if (!a.is_main && !b.is_main) {
        const timeDiff = new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
        if (timeDiff !== 0) return timeDiff
        // Tie-breaker: existing order or ID to ensure stability
        return a.id.localeCompare(b.id)
      }
      return 0
    })

    return {
      main: sorted.find(c => c.is_main) || null,
      secondary: sorted.filter(c => !c.is_main)
    }
  }, [localCharacters])
  
  // Sequential form logic: find first incomplete form index
  const { activeFormIndex, completedCount, totalForms } = useMemo(() => {
    const secondary = sortedCharacters.secondary
    const total = secondary.length
    
    // Find first incomplete form
    let firstIncomplete = -1
    let completed = 0
    
    for (let i = 0; i < secondary.length; i++) {
      if (isCharacterFormComplete(secondary[i])) {
        completed++
      } else if (firstIncomplete === -1) {
        firstIncomplete = i
      }
    }
    
    return {
      activeFormIndex: firstIncomplete === -1 ? total : firstIncomplete, // -1 means all complete
      completedCount: completed,
      totalForms: total
    }
  }, [sortedCharacters.secondary, isCharacterFormComplete])

  // Check modes (use localProjectStatus for realtime updates)
  const isCharacterMode = ['character_generation', 'character_review', 'character_revision_needed', 'characters_approved'].includes(localProjectStatus)
  const isIllustrationMode = [
    // Current statuses
    'characters_approved',
    'sketches_review', 'sketches_revision',
    'illustration_approved',
    'completed',
    // Legacy statuses (for backward compatibility)
    'trial_review', 'trial_revision', 'trial_approved',
    'illustrations_generating',
    'illustration_review', 'illustration_revision_needed',
  ].includes(localProjectStatus)
  const showGallery = useMemo(() => {
    // ONLY show gallery if characters have customer_image_url
    // This ensures forms are shown when "Request Input" is clicked (no images yet)
    // And gallery is shown when "Send Characters" is clicked (after images are synced)
    const hasCustomerImages = sortedCharacters.secondary.some(c => c.customer_image_url !== null && c.customer_image_url !== '')
    return hasCustomerImages
  }, [sortedCharacters.secondary, localProjectStatus])

  const showIllustrationsTab = isIllustrationMode

  // Redirect Logic — only on initial page load (not after in-app navigation)
  const hasRedirected = useRef(false)
  useEffect(() => {
    if (hasRedirected.current) return
    if (showIllustrationsTab && !searchParams?.get('tab')) {
      hasRedirected.current = true
      router.replace(`${pathname}?tab=illustrations`)
    } else if (showGallery && !searchParams?.get('tab') && isCharacterMode) {
      hasRedirected.current = true
      router.replace(`${pathname}?tab=characters`)
    }
  }, [showIllustrationsTab, showGallery, searchParams, pathname, router, isCharacterMode])

  // Detect when all character forms are complete and show popup
  useEffect(() => {
    // Skip if already dismissed this session
    const wasDismissed = sessionStorage.getItem(popupDismissedKey)
    if (wasDismissed) return

    // Skip if no secondary characters
    if (!sortedCharacters.secondary.length) return

    // Skip if gallery is showing (means forms are already submitted)
    if (showGallery) return

    // Skip if not in character review mode
    if (!isCharacterMode) return

    // Check if ALL secondary characters are SAVED (in database, not just form state)
    // A character is "ready" when it has all required fields saved to database
    const allReady = sortedCharacters.secondary.every(char => {
      return !!(
        char.age?.trim() &&
        char.gender?.trim() &&
        char.skin_color?.trim() &&
        char.hair_color?.trim() &&
        char.hair_style?.trim() &&
        char.eye_color?.trim() &&
        (char.clothing?.trim() || char.accessories?.trim() || char.special_features?.trim())
      )
    })

    // Show popup IMMEDIATELY when last form is SAVED (not just filled)
    if (allReady && !showCompletionPopup) {
      setShowCompletionPopup(true)
    }
  }, [sortedCharacters.secondary, popupDismissedKey, showGallery, isCharacterMode, showCompletionPopup])

  const handleIllustrationFeedbackChange = useCallback(async (pageId: string, notes: string) => {
    // 1. Optimistic Update
    setIllustrationEdits(prev => ({
      ...prev,
      [pageId]: notes
    }))

    setLocalPages(prev => prev.map(p =>
      p.id === pageId
        ? { ...p, feedback_notes: notes }
        : p
    ))

    // 2. API Call
    try {
      const response = await fetch(`/api/review/pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_notes: notes }),
      })

      if (!response.ok) {
        throw new Error('Failed to save feedback')
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to save feedback')
      throw error
    }
  }, [])

  // Handle customer accepting admin reply (resolves the feedback)
  const handleAcceptAdminReply = useCallback(async (pageId: string) => {
    try {
      const response = await fetch(`/api/review/pages/${pageId}/accept-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Failed to accept reply')
      }

      const updatedPage = await response.json()

      // Update local state
      setLocalPages(prev => prev.map(p =>
        p.id === pageId ? { ...p, ...updatedPage } : p
      ))

      toast.success('Response accepted')
    } catch (error) {
      console.error(error)
      toast.error('Failed to accept response')
      throw error
    }
  }, [])

  // Handle customer follow-up reply
  const handleCustomerFollowUp = useCallback(async (pageId: string, notes: string) => {
    try {
      const response = await fetch(`/api/review/pages/${pageId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_notes: notes }),
      })

      if (!response.ok) {
        throw new Error('Failed to save follow-up')
      }

      const updatedPage = await response.json()

      // Update local state
      setLocalPages(prev => prev.map(p =>
        p.id === pageId ? { ...p, ...updatedPage } : p
      ))

      toast.success('Follow-up saved')
    } catch (error) {
      console.error(error)
      toast.error('Failed to save follow-up')
      throw error
    }
  }, [])

  // Handle customer edit follow-up (only last message, only if admin hasn't responded)
  const handleEditFollowUp = useCallback(async (pageId: string, notes: string) => {
    try {
      const response = await fetch(`/api/review/pages/${pageId}/follow-up`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_notes: notes }),
      })

      if (!response.ok) {
        throw new Error('Failed to edit follow-up')
      }

      const updatedPage = await response.json()

      // Update local state
      setLocalPages(prev => prev.map(p =>
        p.id === pageId ? { ...p, ...updatedPage } : p
      ))

      toast.success('Follow-up updated')
    } catch (error) {
      console.error(error)
      toast.error('Failed to edit follow-up')
      throw error
    }
  }, [])

  const isLocked = ![
    'character_review', 'character_revision_needed',
    // New statuses
    'trial_review', 'trial_revision',
    'sketches_review', 'sketches_revision',
    // Legacy statuses
    'illustration_review', 'illustration_revision_needed'
  ].includes(localProjectStatus)

  // Find pages with pending admin replies (unresolved feedback WITH admin reply)
  const pagesWithPendingAdminReply = useMemo(() => {
    return localPages.filter(p => p.feedback_notes && !p.is_resolved && p.admin_reply)
  }, [localPages])

  // Calculate submit disabled
  const isSubmitDisabled = useMemo(() => {
    // If in Illustration Mode, disable Approve only if there's unresolved feedback WITHOUT admin reply
    // (Pages with admin reply can be auto-resolved on approval)
    if (showIllustrationsTab) {
      const hasUnresolvedFeedbackWithoutReply = localPages.some(p => p.feedback_notes && !p.is_resolved && !p.admin_reply)
      return hasUnresolvedFeedbackWithoutReply
    }

    // Character checks
    if (!sortedCharacters.secondary.length) return false
    return !sortedCharacters.secondary.every(char => {
      const formInfo = characterForms[char.id]
      return formInfo && formInfo.isValid
    })
  }, [sortedCharacters.secondary, characterForms, showIllustrationsTab, localPages])

  const handleCharacterAdded = useCallback(() => {
    // Character addition handled by realtime subscription
    // No manual refresh needed
  }, [])

  // Handle completion popup actions
  const handlePopupSubmit = useCallback(() => {
    sessionStorage.setItem(popupDismissedKey, 'true')
    setShowCompletionPopup(false)
    handleSubmitChanges() // Same as navbar button
  }, [popupDismissedKey])

  const handlePopupCancel = useCallback(() => {
    sessionStorage.setItem(popupDismissedKey, 'true')
    setShowCompletionPopup(false)
  }, [popupDismissedKey])

  const handleSubmitChanges = async () => {
    if (isLocked) {
      toast.error('This project has already been submitted')
      return
    }

    // If in illustrations mode and there are pages with pending admin replies, show warning first
    if (showIllustrationsTab && pagesWithPendingAdminReply.length > 0) {
      setShowApproveWarningDialog(true)
      return
    }

    await executeSubmit()
  }

  const executeSubmit = async () => {
    setIsSubmitting(true)
    setSubmissionStatus('loading')

    // Prepare character data for submission
    const characterEdits = Object.entries(characterForms).reduce((acc, [id, info]) => {
      acc[id] = info.data
      return acc
    }, {} as Record<string, any>)

    try {
      const response = await fetch(`/api/review/${reviewToken}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageEdits: manuscriptEdits,
          characterEdits: characterEdits,
          illustrationEdits: {} // Relies on instant-save DB state to prevent stale overwrite
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit changes')
      }

      setSubmissionStatus('success')
      // Success screen and status updates handled by project status realtime subscription

    } catch (error: unknown) {
      console.error('Error submitting changes:', error)
      toast.error(getErrorMessage(error, 'Failed to submit changes'))
      setSubmissionStatus('idle')
      setIsSubmitting(false)
    }
  }

  const handleApproveWarningConfirm = async () => {
    setShowApproveWarningDialog(false)
    await executeSubmit()
  }

  const handleApproveCharacters = async () => {
    if (isLocked) return

    setIsApproving(true)
    setSubmissionStatus('loading')
    try {
      const response = await fetch(`/api/review/${reviewToken}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageEdits: {},
          characterEdits: {}
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to approve')
      }

      setSubmissionStatus('success')
      // Status update handled by project status realtime subscription

    } catch (error: unknown) {
      console.error('Error approving:', error)
      toast.error('Failed to approve characters')
      setSubmissionStatus('idle')
      setIsApproving(false)
    }
  }

  const isApprovedState = localProjectStatus === 'characters_approved'

  const isHiddenGenerationState =
    localProjectStatus === 'character_generation' ||
    localProjectStatus === 'character_generation_complete'

  const isApproveDisabled = useMemo(() => {
    if (showIllustrationsTab) return false

    // Check if any SECONDARY character has UNRESOLVED feedback
    // Check if any secondary character has unresolved feedback
    const hasUnresolvedFeedback = sortedCharacters.secondary.some(char =>
      char.feedback_notes && !char.is_resolved
    )

    return hasUnresolvedFeedback
  }, [sortedCharacters.secondary, showIllustrationsTab])

  const showStatusScreen = (isLocked && !showIllustrationsTab && !showGallery) || isHiddenGenerationState || (isApprovedState && !showIllustrationsTab)

  const page1 = localPages.find(p => p.page_number === 1)
  const pageCount = localPages.length
  // Use local characters length
  const characterCount = localCharacters?.length || 0

  // --- RENDERING ---
  return (
    <>
      <UnifiedProjectLayout
        header={
          <CustomerProjectHeader
            projectTitle={projectTitle}
            authorName={authorName}
            pageCount={pageCount}
            characterCount={characterCount}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmitChanges}
            showSubmitButton={showIllustrationsTab || (!isLocked && !isEditMode && !showGallery)}
            isSubmitDisabled={isSubmitDisabled}
            showApproveButton={showGallery && !isLocked && !isEditMode && !showIllustrationsTab}
            onApprove={handleApproveCharacters}
            isApproving={isApproving}
            isApproveDisabled={isApproveDisabled}
            showIllustrationsTab={showIllustrationsTab}
            projectStatus={projectStatus}
            illustrationSendCount={illustrationSendCount}
          />
        }
        sidebar={
          activeTab === 'illustrations' && showIllustrationsTab && !showStatusScreen ? (
            <UnifiedIllustrationSidebar
              mode="customer"
              pages={localPages as any}
              activePageId={activeIllustrationPageId || localPages.find(p => p.page_number === 1)?.id || null}
              projectStatus={localProjectStatus as any}
              illustrationSendCount={illustrationSendCount}
              onPageClick={setActiveIllustrationPageId}
            />
          ) : null
        }
      >
        {showStatusScreen ? (
          <SubmissionSuccessScreen isApprovedState={isApprovedState} />
        ) : (
          <div className={activeTab === 'illustrations' ? 'p-0 pb-0 pt-0 h-[calc(100vh-70px)]' : 'p-8 pb-32'}>

            {/* Pages Tab Content */}
            <div className={activeTab === 'pages' ? 'block' : 'hidden'}>
              <CustomerManuscriptEditor
                pages={localPages as any}
                projectId={projectId}
                onEditsChange={setManuscriptEdits}
                isEditMode={isEditMode}
                onEditModeChange={setIsEditMode}
                isVisible={activeTab === 'pages'}
              />
            </div>

            {/* Characters Tab Content */}
            <div className={activeTab === 'characters' ? 'block space-y-4' : 'hidden'}>
              {/* Gallery or Forms */}
              {showGallery ? (
                <CustomerCharacterGallery
                  characters={sortedCharacters.secondary}
                  mainCharacter={sortedCharacters.main || undefined}
                />
              ) : (
                // Character Forms - only show secondary characters (main character has no form data)
                <div className="space-y-6">
                  {/* Character Forms Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                    {/* Main character form is no longer shown - main character data comes from uploaded image and story extraction */}
                    {sortedCharacters.secondary.map((character, index) => (
                      <CustomerCharacterCard
                        key={character.id}
                        character={character}
                        onChange={handleCharacterChange}
                        isLocked={index > activeFormIndex}
                      />
                    ))}
                    <div className="h-full">
                      <CustomerAddCharacterButton
                        mode="card"
                        projectId={projectId}
                        mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
                        onCharacterAdded={handleCharacterAdded}
                      />
                    </div>
                  </div>

                  {/* Fixed Bottom Progress Bar */}
                  {totalForms > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg">
                      <div className="w-full bg-gray-100 h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-green-500 to-emerald-500 h-1.5 transition-all duration-500 ease-out"
                          style={{ width: `${(completedCount / totalForms) * 100}%` }}
                        />
                      </div>
                      <div className="px-4 sm:px-8 py-3 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-500">
                          {completedCount} of {totalForms} completed
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(!localCharacters || localCharacters.length === 0) && !showGallery && (
                <p className="text-sm text-gray-500 text-center py-8">
                  No characters yet.
                </p>
              )}
            </div>

            {/* Illustrations Tab Content */}
            {showIllustrationsTab && (
              <div className={activeTab === 'illustrations' ? 'block h-full' : 'hidden'}>
                <UnifiedIllustrationFeed
                  mode="customer"
                  pages={localPages}
                  activePageId={activeIllustrationPageId || localPages.find(p => p.page_number === 1)?.id}
                  onPageChange={setActiveIllustrationPageId}
                  projectStatus={localProjectStatus}
                  illustrationSendCount={illustrationSendCount}
                  onSaveFeedback={async (pageId, notes) => handleIllustrationFeedbackChange(pageId, notes)}
                  onAcceptAdminReply={handleAcceptAdminReply}
                  onCustomerFollowUp={handleCustomerFollowUp}
                  onEditFollowUp={handleEditFollowUp}
                  showColoredToCustomer={showColoredToCustomer}
                />
              </div>
            )}
          </div>
        )}
      </UnifiedProjectLayout>

      <SubmissionStatusModal
        isOpen={submissionStatus !== 'idle'}
        status={submissionStatus}
      />

      {/* Character Forms Completion Popup */}
      <Dialog open={showCompletionPopup} onOpenChange={(open) => {
        if (!open) handlePopupCancel()
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
              <PartyPopper className="w-6 h-6 text-green-600" />
              All Forms Complete!
            </DialogTitle>
            <DialogDescription className="text-center text-base pt-2">
              Thank you for filling out the character forms. Ready to submit?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-center mt-4">
            <Button
              onClick={handlePopupCancel}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePopupSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold uppercase tracking-wide"
            >
              {isSubmitting ? (
                <>
                  <Check className="w-4 h-4 mr-2 animate-spin" />
                  SUBMITTING...
                </>
              ) : (
                "SUBMIT FORMS"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Warning Dialog for Pending Admin Replies */}
      <Dialog open={showApproveWarningDialog} onOpenChange={setShowApproveWarningDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Pending Illustrator Notes
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {pagesWithPendingAdminReply.length === 1 ? (
                <>Page {pagesWithPendingAdminReply[0].page_number} has an illustrator note you haven&apos;t responded to.</>
              ) : (
                <>Pages {pagesWithPendingAdminReply.map(p => p.page_number).join(', ')} have illustrator notes you haven&apos;t responded to.</>
              )}
              {' '}Approving will mark {pagesWithPendingAdminReply.length === 1 ? 'this' : 'these'} as resolved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end mt-4">
            <Button
              onClick={() => setShowApproveWarningDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveWarningConfirm}
              disabled={isSubmitting}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              Approve Sketches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}






