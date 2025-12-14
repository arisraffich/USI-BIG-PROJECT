'use client'

import { useMemo, useEffect, useState, useRef, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { CharacterCard } from '@/components/project/CharacterCard'
import { AddCharacterButton } from '@/components/admin/AddCharacterButton'
import { AdminCharacterGallery } from '@/components/admin/AdminCharacterGallery'
import { ManuscriptEditor } from '@/components/project/manuscript/ManuscriptEditor'
import { ProjectHeader } from '@/components/admin/ProjectHeader'
import { UnifiedIllustrationSidebar } from '@/components/illustration/UnifiedIllustrationSidebar'
import { UnifiedProjectLayout } from '@/components/layout/UnifiedProjectLayout'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IllustrationsTabContent } from '@/components/admin/IllustrationsTabContent'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { ProjectStatus } from '@/types/project'

interface ProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus?: string
  projectInfo?: any
  illustrationStatus?: string
}

export function ProjectTabsContent({
  projectId,
  pages,
  characters,
  projectStatus,
  projectInfo,
  illustrationStatus = 'not_started'
}: ProjectTabsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Check if Illustrations are unlocked
  const isIllustrationsUnlocked = projectStatus === 'characters_approved' ||
    projectStatus === 'sketch_generation' ||
    projectStatus === 'sketch_ready' ||
    projectStatus === 'completed'

  // Auto-heal status mismatch
  useEffect(() => {
    if (projectStatus === 'illustration_approved' && illustrationStatus !== 'illustration_approved') {
      const supabase = createClient()
      supabase.from('projects')
        .update({ illustration_status: 'illustration_approved' })
        .eq('id', projectId)
        .then(() => {
          toast.success('Project status synchronized')
          router.refresh()
        })
    }
  }, [projectStatus, illustrationStatus, projectId, router])

  // 1. Determine Active Tab (Hoist to top)
  const activeTab = useMemo(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'illustrations') return 'illustrations'
    if (tab === 'characters') return 'characters'
    if (tab === 'pages') return 'pages'

    // Default tab logic based on status
    if (isIllustrationsUnlocked) return 'illustrations'
    return 'pages'
  }, [searchParams, isIllustrationsUnlocked])

  const isPagesActive = activeTab === 'pages'
  const isCharactersActive = activeTab === 'characters'
  const isIllustrationsActive = activeTab === 'illustrations'

  // 2. Determine Sidebar State
  const showPagesSidebar = isPagesActive
  const showIllustrationsSidebar = isIllustrationsActive
  const showSidebar = showPagesSidebar || showIllustrationsSidebar

  const isGenerating = projectStatus === 'character_generation'
  const isCharactersLoading = isGenerating
  const isAnalyzing = illustrationStatus === 'analyzing'

  const pageCount = pages?.length || 0
  const characterCount = characters?.length || 0

  // Local state for pages to support instant realtime updates
  const [localPages, setLocalPages] = useState<Page[]>(pages || [])
  const lastToastTimeRef = useRef(0)

  const [activeIllustrationPageId, setActiveIllustrationPageId] = useState<string | null>(pages?.[0]?.id || null)
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 })
  const hasStartedAnalysisRef = useRef(false)

  // Sync local state when server props update, but respect newer local versions (from realtime/fetch)
  useEffect(() => {
    if (pages) {
      setLocalPages(currentLocal => {
        if (currentLocal.length === 0) return pages
        return pages.map(serverPage => {
          const localPage = currentLocal.find(p => p.id === serverPage.id)

          // 1. Time-based precedence
          if (localPage?.updated_at && serverPage.updated_at) {
            const localTime = new Date(localPage.updated_at).getTime()
            const serverTime = new Date(serverPage.updated_at).getTime()
            if (localTime > serverTime) return localPage
          }

          // 2. Sticky Data Protection (Critical for Caching Issues)
          if (localPage && (localPage.feedback_notes || localPage.is_approved !== undefined)) {
            const hasLocalNotes = !!localPage.feedback_notes
            const serverMissingNotes = !serverPage.feedback_notes

            if (hasLocalNotes && serverMissingNotes) {
              return {
                ...serverPage,
                feedback_notes: localPage.feedback_notes,
                is_resolved: localPage.is_resolved,
                is_approved: localPage.is_approved,
                feedback_history: localPage.feedback_history
              }
            }
          }

          return serverPage
        })
      })
    }
  }, [pages])

  // Analysis Loop
  useEffect(() => {
    if (isAnalyzing && pages && pages.length > 0) {
      const p1 = pages.find(p => p.page_number === 1)
      if (p1?.character_actions && Object.keys(p1.character_actions).length > 0) {
        if (!hasStartedAnalysisRef.current) {
          hasStartedAnalysisRef.current = true
          const supabase = createClient()
          supabase.from('projects').update({ illustration_status: 'generating' }).eq('id', projectId).then(() => {
            router.refresh()
          })
        }
        return
      }
    }

    if (isAnalyzing && pages && pages.length > 0 && !hasStartedAnalysisRef.current) {
      hasStartedAnalysisRef.current = true
      setAnalysisProgress({ current: 0, total: pages.length })

      const runAnalysis = async () => {
        const supabase = createClient()
        let completedCount = 0
        const pagesToAnalyze = [pages[0]] // Only analyze Page 1

        for (const page of pagesToAnalyze) {
          if (page.character_actions && Object.keys(page.character_actions).length > 0) {
            completedCount++
            continue
          }

          try {
            const response = await fetch('/api/ai/extract-character-actions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                pageId: page.id,
                storyText: page.story_text,
                sceneDescription: page.scene_description,
                characters
              })
            })
            if (!response.ok) throw new Error('Failed to analyze page')
            completedCount++
          } catch (error) {
            console.error(`Error analyzing page ${page.page_number}:`, error)
          }
        }

        await supabase.from('projects').update({ illustration_status: 'generating' }).eq('id', projectId)
        router.refresh()
      }

      runAnalysis()
    }
  }, [isAnalyzing, pages, projectId, characters, router])

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations', e: React.MouseEvent) => {
    e.preventDefault()
    if (tab === 'characters' && isCharactersLoading) return

    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (tab === 'pages') params.delete('tab')
      else params.set('tab', tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  // Sort characters
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
    return { main: sorted.find(c => c.is_main) || null, secondary: sorted.filter(c => !c.is_main) }
  }, [characters])

  const showGallery = useMemo(() => {
    return sortedCharacters.secondary.some(c => c.image_url !== null && c.image_url !== '')
  }, [sortedCharacters.secondary])

  // Realtime subscription for character updates
  useEffect(() => {
    const supabase = createClient()
    const channelName = `admin-project-characters-${projectId}`
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const newChar = payload.new as any
          if (newChar.image_url && !payload.old.image_url) {
            router.refresh()
            toast.success('New character illustration ready', { description: `${newChar.name || newChar.role} has been generated.` })
          }
        }
        if (payload.eventType === 'INSERT') {
          router.refresh()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, router])

  // Polling fallback
  useEffect(() => {
    if (!isGenerating) return
    const intervalId = setInterval(() => { router.refresh() }, 4000)
    return () => clearInterval(intervalId)
  }, [isGenerating, router])

  // Realtime Pages
  useEffect(() => {
    const supabase = createClient()
    const channelName = `project-pages-${projectId}`
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updatedPage = payload.new as Page
          setLocalPages(prev => prev.map(p => p.id === updatedPage.id ? { ...p, ...updatedPage } : p))

          // Debug Realtime
          if (updatedPage.feedback_notes) {
            toast.info('New Feedback Received')
          }

          const now = Date.now()
          if (now - lastToastTimeRef.current > 2000) {
            toast.info('Manuscript updated')
            lastToastTimeRef.current = now
          }
        } else if (payload.eventType === 'INSERT' && payload.new) {
          setLocalPages(prev => [...prev, payload.new as Page])
        }
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, router])

  // Force Client-Side Fetch
  useEffect(() => {
    const fetchFreshPages = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/pages`, {
          cache: 'no-store',
          headers: { 'Pragma': 'no-cache' }
        })

        if (!response.ok) return

        const { pages: freshPages } = await response.json()

        if (freshPages && freshPages.length > 0) {
          setLocalPages(prev => {
            return freshPages.map((freshPage: Page) => {
              const existing = prev.find(p => p.id === freshPage.id)
              return { ...existing, ...freshPage } as Page
            })
          })
        }
      } catch (e) {
        console.error('Error fetching fresh pages:', e)
      }
    }

    fetchFreshPages()
  }, [projectId])

  // Loading State
  if (projectStatus === 'character_generation' && !showGallery) {
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

  // Calculate Trial Readiness
  const isTrialReady = useMemo(() => {
    const page1 = localPages.find(p => p.page_number === 1)
    return !!(page1?.illustration_url && page1?.sketch_url)
  }, [localPages])

  return (
    <UnifiedProjectLayout
      header={
        <ProjectHeader
          projectId={projectId}
          projectInfo={{
            id: projectInfo.id,
            book_title: projectInfo.book_title,
            author_firstname: projectInfo.author_firstname || '',
            author_lastname: projectInfo.author_lastname || '',
            status: (projectStatus as ProjectStatus) || 'draft',
            character_send_count: projectInfo.character_send_count || 0,
            illustration_send_count: projectInfo.illustration_send_count || 0,
            review_token: projectInfo.review_token
          }}
          pageCount={pageCount}
          characterCount={characterCount}
          hasImages={false}
          isTrialReady={isTrialReady}
          onCreateIllustrations={() => {
            const params = new URLSearchParams(searchParams?.toString() || '')
            params.set('tab', 'illustrations')
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
          }}
        />
      }
      sidebar={
        activeTab === 'illustrations' ? (
          <UnifiedIllustrationSidebar
            mode="admin"
            pages={localPages}
            activePageId={activeIllustrationPageId}
            onPageClick={(id) => setActiveIllustrationPageId(id)}
            illustrationStatus={illustrationStatus}
          />
        ) : null
      }
    >
      {/* Main Content Area */}
      <div className={activeTab === 'illustrations' ? 'p-0 pb-0 pt-0' : 'p-8 pb-32'}>

        {/* Pages Tab Content */}
        <div className={activeTab === 'pages' ? 'block' : 'hidden'}>
          <ManuscriptEditor
            pages={localPages as Page[]}
            projectId={projectId}
            isVisible={activeTab === 'pages'}
          />
        </div>

        {/* Characters Tab Content */}
        <div className={activeTab === 'characters' ? 'block space-y-4' : 'hidden'}>
          {showGallery && characters ? (
            <AdminCharacterGallery
              characters={characters}
              projectId={projectId}
              isGenerating={projectStatus === 'character_generation'}
            />
          ) : (
            <>
              {characters && characters.length > 0 ? (
                <div className="w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedCharacters.main && (
                      <CharacterCard key={sortedCharacters.main.id} character={sortedCharacters.main} />
                    )}
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
            </>
          )}
        </div>

        {/* Illustrations Tab Content */}
        <div className={activeTab === 'illustrations' ? 'block space-y-4' : 'hidden'}>
          <IllustrationsTabContent
            projectId={projectId}
            pages={localPages}
            illustrationStatus={illustrationStatus}
            isAnalyzing={isAnalyzing}
            analysisProgress={analysisProgress}
            initialAspectRatio={projectInfo?.illustration_aspect_ratio}
            initialTextIntegration={projectInfo?.illustration_text_integration}
            activePageId={activeIllustrationPageId}
            onPageChange={setActiveIllustrationPageId}
          />
        </div>
      </div>
    </UnifiedProjectLayout>
  )
}
