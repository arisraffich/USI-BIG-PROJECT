'use client'

import { useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CharacterCard } from '@/components/project/CharacterCard'
import { AddCharacterButton } from '@/components/admin/AddCharacterButton'
import { AdminCharacterGallery } from '@/components/admin/AdminCharacterGallery'
import { ManuscriptEditor } from '@/components/project/manuscript/ManuscriptEditor'
import { Loader2 } from 'lucide-react'
import { Page } from '@/types/page'
import { Character } from '@/types/character'

interface ProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus?: string
}

export function ProjectTabsContent({
  projectId,
  pages,
  characters,
  projectStatus
}: ProjectTabsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Read active tab directly from search params - synchronous, instant, no delay
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
    const secondary = sorted.filter(c => !c.is_main)

    return { main, secondary }
  }, [characters])

  // Toggle between Setup View (Form) and Gallery View
  // If any secondary character has an image, show Gallery
  const showGallery = useMemo(() => {
    return sortedCharacters.secondary.some(c => c.image_url !== null && c.image_url !== '')
  }, [sortedCharacters.secondary])

  // Poll for updates every 5 seconds so Admin sees Customer changes
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh if the window is visible
      if (!document.hidden) {
        router.refresh()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [router])

  // Show Loading State if Generating
  if (projectStatus === 'character_generation') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-blue-600 rounded-full p-4">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Generating Character Images...</h2>
        <p className="text-gray-500">The customer has submitted changes. AI is creating the illustrations.</p>
      </div>
    )
  }

  return (
    <div className="p-8 relative min-h-screen">
      {/* Pages Tab Content - Keep rendered, use CSS for instant switching */}
      <div className={activeTab === 'pages' ? 'block' : 'hidden'}>
        <ManuscriptEditor
          pages={pages as any}
          projectId={projectId}
        />
      </div>

      {/* Characters Tab Content - Keep rendered, use CSS for instant switching */}
      <div className={activeTab === 'characters' ? 'block space-y-4' : 'hidden'}>
        {showGallery && characters ? (
          /* Gallery View (Stage 2) */
          <AdminCharacterGallery
            characters={characters}
            projectId={projectId}
          />
        ) : (
          /* Setup View (Stage 1) */
          <>
            {characters && characters.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedCharacters.main && (
                  <CharacterCard key={sortedCharacters.main.id} character={sortedCharacters.main} />
                )}
                {sortedCharacters.secondary.map((character) => (
                  <CharacterCard key={character.id} character={character} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                No characters yet. Characters will appear here after story parsing.
              </p>
            )}
            <div className="fixed bottom-[45px] right-[50px]">
              <AddCharacterButton
                mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
