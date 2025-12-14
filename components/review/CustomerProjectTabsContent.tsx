'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { CustomerIllustrationReview } from './CustomerIllustrationReview'
import { CustomerIllustrationSidebar } from './CustomerIllustrationSidebar'
import { CustomerAddCharacterButton } from './CustomerAddCharacterButton'
import { CustomerManuscriptEditor } from './CustomerManuscriptEditor'
import { CustomerProjectHeader } from './CustomerProjectHeader'
import { SubmissionStatusModal } from './SubmissionStatusModal'
import { CustomerCharacterGallery } from './CustomerCharacterGallery'
import { CustomerCharacterCard } from './CustomerCharacterCard'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Send, Check } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface CustomerProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus: string
  reviewToken: string
  projectTitle: string
  authorName: string
  characterSendCount: number
}

export function CustomerProjectTabsContent({
  projectId,
  pages,
  characters,
  projectStatus,
  reviewToken,
  projectTitle,
  authorName,
  characterSendCount
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

  // Track send count to conditionaly refresh
  const lastSendCount = useRef(characterSendCount)

  // Illustration Feedback State
  const [illustrationEdits, setIllustrationEdits] = useState<{ [pageId: string]: string }>({})

  // Local state for pages to support instant realtime updates
  const [localPages, setLocalPages] = useState<Page[]>(pages || [])

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

          // 2. Background Server Sync
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Realtime Subscription for project status (Auto-refresh on "Resend")
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
          console.log('[Realtime] Project update:', payload.new.status)
          router.refresh()

          // If status changes to a reviewable state, refresh local state
          // logic...
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
    if (characters && characters.length > 0) {
      const initialForms: Record<string, { data: any; isValid: boolean }> = {}

      characters.forEach(char => {
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
  }, [characters])

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
    if (!characters) return { main: null, secondary: [] }

    const sorted = [...characters].sort((a, b) => {
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
  }, [characters])

  // Check modes
  const isCharacterMode = ['character_generation', 'character_review', 'character_revision_needed', 'characters_approved'].includes(projectStatus)
  const isIllustrationMode = ['illustration_review', 'illustration_revision_needed'].includes(projectStatus)
  const showGallery = useMemo(() => {
    return sortedCharacters.secondary.some(c => c.image_url !== null && c.image_url !== '')
  }, [sortedCharacters.secondary])

  const showIllustrationsTab = isIllustrationMode

  // Redirect Logic
  // If in illustration mode, default to illustration tab
  useEffect(() => {
    if (showIllustrationsTab && !searchParams?.get('tab')) {
      router.replace(`${pathname}?tab=illustrations`)
    } else if (showGallery && !searchParams?.get('tab') && isCharacterMode) {
      // Only redirect to character gallery if NOT in illustration mode
      router.replace(`${pathname}?tab=characters`)
    }
  }, [showIllustrationsTab, showGallery, searchParams, pathname, router, isCharacterMode])

  const handleIllustrationFeedbackChange = useCallback((pageId: string, notes: string) => {
    setIllustrationEdits(prev => ({
      ...prev,
      [pageId]: notes
    }))

    // Optimistically update local pages so the UI reflects the change immediately
    setLocalPages(prev => prev.map(p =>
      p.id === pageId
        ? { ...p, feedback_notes: notes }
        : p
    ))
  }, [])

  const isLocked = !['character_review', 'character_revision_needed', 'illustration_review', 'illustration_revision_needed'].includes(projectStatus)

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
    setLocalPages(prev => [...prev]) // Force re-render? No need, props update handles it.
    router.refresh()
  }, [router])

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
          illustrationEdits: illustrationEdits // New payload
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit changes')
      }

      setSubmissionStatus('success')

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
      // Logic: Submit empty edits. The backend will see no feedback notes (because we don't send any from Gallery) and move to `characters_approved`.
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

    } catch (error: any) {
      console.error('Error approving:', error)
      toast.error('Failed to approve characters')
      setSubmissionStatus('idle')
      setIsApproving(false)
    }
  }

  const isApprovedState = projectStatus === 'characters_approved'

  const isHiddenGenerationState =
    projectStatus === 'character_generation' ||
    projectStatus === 'character_generation_complete'

  if ((isLocked && !showIllustrationsTab && !showGallery) || isHiddenGenerationState || (isApprovedState && !showIllustrationsTab)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isApprovedState ? 'Characters Approved!' : 'Changes Submitted Successfully'}
          </h2>
          <p className="text-gray-600 mb-6">
            {isApprovedState
              ? 'Thank you for approving the characters. We will now proceed with creating the illustrations for your book.'
              : 'Thank you for submitting your character details and manuscript updates.'}
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">What happens next?</p>
            <p>
              {isApprovedState
                ? 'Our illustrators will start working on the full scene illustrations. You will be notified when the first drafts are ready.'
                : 'Our illustrators are now creating your character illustrations based on your specifications. You will be notified once they are ready for review.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Page 1 for Illustration Review
  const page1 = localPages.find(p => p.page_number === 1)

  const pageCount = localPages.length
  const characterCount = characters?.length || 0

  // Approval disabled?
  // For characters: disabled if not all secondary chars are valid.
  // For illustrations: not used (we submit changes instead).
  const isApproveDisabled = useMemo(() => {
    if (showIllustrationsTab) return false
    if (!sortedCharacters.secondary.length) return false
    return !sortedCharacters.secondary.every(char => {
      const formInfo = characterForms[char.id]
      return formInfo && formInfo.isValid
    })
  }, [sortedCharacters.secondary, characterForms, showIllustrationsTab])

  return (
    <>
      <CustomerProjectHeader
        projectTitle={projectTitle}
        authorName={authorName}
        pageCount={pageCount}
        characterCount={characterCount}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmitChanges}
        showSubmitButton={(!isLocked && !isEditMode)}
        isSubmitDisabled={isSubmitDisabled}
        hideOnMobile={activeTab === 'characters' && showGallery}
        // Approval Props (Only for Character Phase)
        showApproveButton={showGallery && !isLocked && !isEditMode && !showIllustrationsTab}
        onApprove={handleApproveCharacters}
        isApproving={isApproving}
        isApproveDisabled={isApproveDisabled}
        // New Prop
        showIllustrationsTab={showIllustrationsTab}
      />
      <div className={`relative min-h-screen ${activeTab === 'characters' && showGallery ? 'pt-8 md:pt-24' : 'pt-24'} ${activeTab === 'illustrations' ? 'lg:pl-[250px]' : ''}`}>

        {/* Illustrations Sidebar (Only visible on Illustrations tab) */}
        {activeTab === 'illustrations' && showIllustrationsTab && (
          <CustomerIllustrationSidebar
            pages={localPages as any}
            activePageId={page1?.id || null}
            onPageClick={(id) => {
              // Navigate to page (future support for multiple pages)
              toast.info(`Switched to Page ${localPages.find(p => p.id === id)?.page_number}`)
            }}
          />
        )}

        <div className="p-8 pb-32">
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
            {/* ... (Existing Character Logic) */}
            {showGallery ? (
              <CustomerCharacterGallery
                characters={sortedCharacters.secondary}
                mainCharacter={sortedCharacters.main || undefined}
              />
            ) : (
              <>
                {characters && characters.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedCharacters.main && (
                      <CustomerCharacterCard
                        key={sortedCharacters.main.id}
                        character={sortedCharacters.main}
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
                    {/* Add Character Ghost Card - Always at the end */}
                    <div className="h-full">
                      <CustomerAddCharacterButton
                        mode="card"
                        projectId={projectId}
                        mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
                        onCharacterAdded={handleCharacterAdded}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No characters yet. Characters will appear here after story parsing.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Illustrations Tab Content */}
          {showIllustrationsTab && page1 && (
            <div className={activeTab === 'illustrations' ? 'block space-y-4' : 'hidden'}>
              <CustomerIllustrationReview
                page={page1}
                onChange={handleIllustrationFeedbackChange}
              />
            </div>
          )}
        </div>
      </div>
      <SubmissionStatusModal
        isOpen={submissionStatus !== 'idle'}
        status={submissionStatus}
      />
    </>
  )
}
