'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { CharacterCard } from '@/components/project/CharacterCard'
import { AddCharacterButton } from '@/components/admin/AddCharacterButton'
import { AdminCharacterGallery } from '@/components/admin/AdminCharacterGallery'
import { ManuscriptEditor } from '@/components/project/manuscript/ManuscriptEditor'
import { Loader2, Sparkles } from 'lucide-react'
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

  // Local state for pages to support instant realtime updates
  const [localPages, setLocalPages] = useState<Page[]>(pages || [])
  const lastToastTimeRef = useRef(0)

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

  // Realtime Subscription for Characters
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('project-characters')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'characters',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          router.refresh()

          if (payload.eventType === 'INSERT') {
            toast.success('New character discovered!', {
              description: 'AI has identified a new character in your story.'
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Realtime Subscription for Pages
  useEffect(() => {
    const supabase = createClient()
    const channelName = `project-pages-${projectId}`

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

            // Debounce toast to prevent flood during bulk updates (e.g. AI analysis)
            const now = Date.now()
            if (now - lastToastTimeRef.current > 2000) {
              toast.info('Manuscript updated', {
                description: 'Page content has been modified.'
              })
              lastToastTimeRef.current = now
            }
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
    <div className="p-8 pb-32 relative min-h-screen">
      {/* Pages Tab Content - Keep rendered, use CSS for instant switching */}
      <div className={activeTab === 'pages' ? 'block' : 'hidden'}>
        <ManuscriptEditor
          pages={localPages as any}
          projectId={projectId}
          isVisible={activeTab === 'pages'}
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
              <div className="w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedCharacters.main && (
                    <CharacterCard key={sortedCharacters.main.id} character={sortedCharacters.main} />
                  )}

                  {/* Scanning Indicator Card - Shows next to main character when only 1 character exists */}
                  {characters.length <= 1 && (
                    <div className="bg-[#f65952]/5 border border-[#f65952]/20 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center min-h-[300px] animate-pulse">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[#f65952] rounded-full animate-ping opacity-20"></div>
                        <div className="relative bg-white rounded-full p-3 shadow-sm border border-[#f65952]/20">
                          <Sparkles className="w-6 h-6 text-[#f65952]" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-[#f65952]">Analysing Story...</h3>
                        <p className="text-sm text-[#f65952]/80 max-w-[200px]">
                          AI is reading your manuscript to identify more characters.
                        </p>
                      </div>
                    </div>
                  )}

                  {sortedCharacters.secondary.map((character) => (
                    <CharacterCard key={character.id} character={character} />
                  ))}

                  {/* Add Character Ghost Card - Shown only after scanning is complete (more than 1 char) */}
                  {characters.length > 1 && (
                    <div className="h-full">
                      <AddCharacterButton
                        mode="card"
                        mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                No characters yet. Characters will appear here after story parsing.
              </p>
            )}

            {/* Fixed button removed as per design change */}
          </>
        )}
      </div>
    </div>
  )
}
