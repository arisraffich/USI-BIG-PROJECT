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

interface CustomerProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus: string
  reviewToken: string
  projectTitle: string
  authorName: string
  characterSendCount: number
  illustrationStatus: string
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
  illustrationStatus
}: CustomerProjectTabsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success'>('idle')
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
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedChar = payload.new as Character
            setLocalCharacters(prev => prev.map(c => c.id === updatedChar.id ? { ...c, ...updatedChar } : c))
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
    if (tab === 'illustations') return 'illustrations' // typo handle?
    return tab === 'characters' ? 'characters' : (tab === 'illustrations' ? 'illustrations' : 'pages')
  }, [searchParams])

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

  // Check modes (use localProjectStatus for realtime updates)
  const isCharacterMode = ['character_generation', 'character_review', 'character_revision_needed', 'characters_approved'].includes(localProjectStatus)
  const isIllustrationMode = ['illustration_review', 'illustration_revision_needed', 'illustration_approved', 'illustration_production', 'completed'].includes(localProjectStatus)
  const showGallery = useMemo(() => {
    // ONLY show gallery if characters have customer_image_url
    // This ensures forms are shown when "Request Input" is clicked (no images yet)
    // And gallery is shown when "Send Characters" is clicked (after images are synced)
    const hasCustomerImages = sortedCharacters.secondary.some(c => c.customer_image_url !== null && c.customer_image_url !== '')
    return hasCustomerImages
  }, [sortedCharacters.secondary, localProjectStatus])

  const showIllustrationsTab = isIllustrationMode

  // Redirect Logic
  useEffect(() => {
    if (showIllustrationsTab && !searchParams?.get('tab')) {
      router.replace(`${pathname}?tab=illustrations`)
    } else if (showGallery && !searchParams?.get('tab') && isCharacterMode) {
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

  const isLocked = !['character_review', 'character_revision_needed', 'illustration_review', 'illustration_revision_needed'].includes(localProjectStatus)

  // Calculate submit disabled
  const isSubmitDisabled = useMemo(() => {
    // If in Illustration Mode, we are always valid (empty feedback is allowed = approval)
    if (showIllustrationsTab) return false

    // Character checks
    if (!sortedCharacters.secondary.length) return false
    return !sortedCharacters.secondary.every(char => {
      const formInfo = characterForms[char.id]
      return formInfo && formInfo.isValid
    })
  }, [sortedCharacters.secondary, characterForms, showIllustrationsTab])

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

    } catch (error: any) {
      console.error('Error submitting changes:', error)
      toast.error(error.message || 'Failed to submit changes')
      setSubmissionStatus('idle')
      setIsSubmitting(false)
    }
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

    } catch (error: any) {
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
          />
        }
        sidebar={
          activeTab === 'illustrations' && showIllustrationsTab && !showStatusScreen ? (
            <UnifiedIllustrationSidebar
              mode="customer"
              pages={localPages as any}
              activePageId={activeIllustrationPageId || localPages.find(p => p.page_number === 1)?.id || null}
              illustrationStatus={illustrationStatus}
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
                // ... Existing Character Forms ...
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedCharacters.main && (
                    <CustomerCharacterCard
                      key={sortedCharacters.main.id}
                      character={sortedCharacters.main!}
                      onChange={handleCharacterChange}
                    />
                  )}
                  {sortedCharacters.secondary.map((character) => (
                    <CustomerCharacterCard
                      key={character.id}
                      character={character}
                      onChange={handleCharacterChange}
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
                  illustrationStatus={illustrationStatus}
                  onSaveFeedback={async (pageId, notes) => handleIllustrationFeedbackChange(pageId, notes)}
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
    </>
  )
}

