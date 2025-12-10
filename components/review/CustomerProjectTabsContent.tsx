'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import { CustomerCharacterCard } from './CustomerCharacterCard'
import { CustomerAddCharacterButton } from './CustomerAddCharacterButton'
import { CustomerManuscriptEditor } from './CustomerManuscriptEditor'
import { CustomerProjectHeader } from './CustomerProjectHeader'
import { SubmissionStatusModal } from './SubmissionStatusModal'
import { CustomerCharacterGallery } from './CustomerCharacterGallery'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Send, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface CustomerProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus: string
  reviewToken: string
  projectTitle: string
  authorName: string
}

export function CustomerProjectTabsContent({
  projectId,
  pages,
  characters,
  projectStatus,
  reviewToken,
  projectTitle,
  authorName
}: CustomerProjectTabsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  // Lifted state for Edit Mode to coordinate Header and Editor
  const [isEditMode, setIsEditMode] = useState(false)

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

  // Store manuscript editor edits
  const [manuscriptEdits, setManuscriptEdits] = useState<{ [pageId: string]: { story_text?: string; scene_description?: string } }>({})

  // Store character form data and validity
  // Map id -> { data, isValid }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [characterForms, setCharacterForms] = useState<{ [id: string]: { data: any; isValid: boolean } }>({})

  const handleCharacterChange = useCallback((id: string, data: any, isValid: boolean) => {
    setCharacterForms(prev => ({
      ...prev,
      [id]: { data, isValid }
    }))
  }, [])

  // Read active tab directly from search params
  const activeTab = useMemo(() => {
    const tab = searchParams?.get('tab')
    return tab === 'characters' ? 'characters' : 'pages'
  }, [searchParams])

  // Sort characters: main character first, then secondary by creation date
  const sortedCharacters = useMemo(() => {
    if (!characters) return { main: null, secondary: [] }

    const sorted = [...characters].sort((a, b) => {
      if (a.is_main && !b.is_main) return -1
      if (!a.is_main && b.is_main) return 1
      if (!a.is_main && !b.is_main) {
        return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
      }
      return 0
    })

    const main = sorted.find(c => c.is_main) || null
    // Important: typed correctly as Character array
    const secondary = sorted.filter(c => !c.is_main)

    return { main, secondary }
  }, [characters])

  // Check if we are in "Stage 2" (Images generated)
  // We check if any secondary character has an image_url
  const showGallery = useMemo(() => {
    return sortedCharacters.secondary.some(c => c.image_url !== null && c.image_url !== '')
  }, [sortedCharacters.secondary])

  // Check if project is locked (status changed from character_review)
  const isLocked = projectStatus !== 'character_review'

  // Calculate if submit button should be disabled
  // Logic: Active only when all EDITABLE character forms are valid
  // Main character is read-only, so we focus on secondary characters
  const isSubmitDisabled = useMemo(() => {
    if (!sortedCharacters.secondary.length) return false

    // Check if every secondary character has an entry in characterForms AND it is valid
    return !sortedCharacters.secondary.every(char => {
      const formInfo = characterForms[char.id]
      return formInfo && formInfo.isValid
    })
  }, [sortedCharacters.secondary, characterForms])

  const handleCharacterAdded = useCallback(() => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1000)
  }, [router])

  const handleSubmitChanges = async () => {
    if (isLocked) {
      toast.error('This project has already been submitted')
      return
    }

    setIsSubmitting(true)
    setSubmissionStatus('loading')

    // Prepare character data for submission
    // Map existing forms to a clean object
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
          characterEdits: characterEdits
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit changes')
      }

      // Success! Show success modal state
      setSubmissionStatus('success')
      // Note: We do NOT redirect. The modal stays open as the "Thank You" screen.

    } catch (error: any) {
      console.error('Error submitting changes:', error)
      toast.error(error.message || 'Failed to submit changes')
      setSubmissionStatus('idle')
      setIsSubmitting(false)
    }
  }

  // Guard Clause: Block access if locked AND (NOT in gallery mode OR Generation is pending/complete but not approved)
  // Logic Update: If status is 'character_generation' or 'character_generation_complete', we MUST hide the gallery
  // and show the "Submitted/Processing" screen, regardless of whether images exist.
  // The gallery only unlocks when Admin sends it back (status becomes 'character_review' or 'characters_approved')

  const isHiddenGenerationState =
    projectStatus === 'character_generation' ||
    projectStatus === 'character_generation_complete'

  if ((isLocked && !showGallery) || isHiddenGenerationState) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Changes Submitted Successfully</h2>
          <p className="text-gray-600 mb-6">
            Thank you for submitting your character details and manuscript updates.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">What happens next?</p>
            <p>Our illustrators are now creating your character illustrations based on your specifications. You will be notified once they are ready for review.</p>
          </div>
        </div>
      </div>
    )
  }

  // Redirect to characters tab by default if in gallery mode
  useEffect(() => {
    if (showGallery && !searchParams?.get('tab')) {
      // Use replace to avoid history stack buildup
      router.replace(`${pathname}?tab=characters`)
    }
  }, [showGallery, searchParams, pathname, router])

  const pageCount = pages?.length || 0
  const characterCount = characters?.length || 0

  return (
    <>
      <CustomerProjectHeader
        projectTitle={projectTitle}
        authorName={authorName}
        pageCount={pageCount}
        characterCount={characterCount}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmitChanges}
        showSubmitButton={!showGallery && !isLocked && !isEditMode}
        isSubmitDisabled={isSubmitDisabled}
        hideOnMobile={activeTab === 'characters' && showGallery}
      />
      <div className={`p-8 pb-32 relative min-h-screen ${activeTab === 'characters' && showGallery ? 'pt-8 md:pt-24' : 'pt-24'}`}>
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
          {/* Conditional Rendering: Gallery (Stage 2) vs Form (Stage 1) */}
          {showGallery ? (
            <CustomerCharacterGallery
              characters={characters || []}
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
      </div>
      <SubmissionStatusModal
        isOpen={submissionStatus !== 'idle'}
        status={submissionStatus}
      />
    </>
  )
}
