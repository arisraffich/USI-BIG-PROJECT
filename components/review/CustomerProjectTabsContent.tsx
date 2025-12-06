'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { CustomerCharacterCard } from './CustomerCharacterCard'
import { CustomerAddCharacterButton } from './CustomerAddCharacterButton'
import { CustomerManuscriptEditor } from './CustomerManuscriptEditor'
import { CustomerProjectHeader } from './CustomerProjectHeader'
import { CustomerCharacterGallery } from './CustomerCharacterGallery'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Store manuscript editor edits
  const [manuscriptEdits, setManuscriptEdits] = useState<{ [pageId: string]: { story_text?: string; scene_description?: string } }>({})

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
    try {
      const response = await fetch(`/api/review/${reviewToken}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageEdits: manuscriptEdits,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit changes')
      }

      // Redirect to success page
      router.push(`/review/${reviewToken}/submitted`)
    } catch (error: any) {
      console.error('Error submitting changes:', error)
      toast.error(error.message || 'Failed to submit changes')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Guard Clause: Block access if locked AND NOT in gallery mode
  // If in Gallery mode (Stage 2), we allow viewing even if "locked" (or if admin put it back to review)
  // Actually, if status is 'character_generation_complete', isLocked is true.
  // We want to show Gallery.
  if (isLocked && !showGallery) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Project Already Submitted</h2>
          <p className="text-gray-600">
            This project has already been submitted and is being processed by our illustrators.
          </p>
        </div>
      </div>
    )
  }

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
        showSubmitButton={!showGallery && !isLocked}
      />
      <div className="p-8 pt-24 relative min-h-screen">
        {/* Pages Tab Content */}
        <div className={activeTab === 'pages' ? 'block' : 'hidden'}>
          <CustomerManuscriptEditor
            pages={pages as any}
            projectId={projectId}
            onEditsChange={setManuscriptEdits}
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
                    />
                  )}
                  {sortedCharacters.secondary.map((character) => (
                    <CustomerCharacterCard
                      key={character.id}
                      character={character}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  No characters yet. Characters will appear here after story parsing.
                </p>
              )}
              <div className="fixed bottom-[45px] right-[50px]">
                <CustomerAddCharacterButton
                  projectId={projectId}
                  mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
                  onCharacterAdded={handleCharacterAdded}
                />
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
