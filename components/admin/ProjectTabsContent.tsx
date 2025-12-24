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
import { CharacterFormData } from '@/components/shared/UniversalCharacterCard'

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

  // Local state for characters to support instant realtime updates
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters || [])
  
  // Local state for project status to support instant realtime updates
  const [localProjectStatus, setLocalProjectStatus] = useState<string>(projectStatus || 'draft')

  // Sync local characters when server props update
  useEffect(() => {
    if (characters) {
      setLocalCharacters(characters)
    }
  }, [characters])
  
  // Sync local project status when server props update
  useEffect(() => {
    if (projectStatus) {
      setLocalProjectStatus(projectStatus)
    }
  }, [projectStatus])

  // Check if Illustrations are unlocked
  const isIllustrationsUnlocked = localProjectStatus === 'characters_approved' ||
    localProjectStatus === 'sketch_generation' ||
    localProjectStatus === 'sketch_ready' ||
    localProjectStatus === 'completed'

  // Auto-heal status mismatch
  useEffect(() => {
    if (localProjectStatus === 'illustration_approved' && illustrationStatus !== 'illustration_approved') {
      const supabase = createClient()
      supabase.from('projects')
        .update({ illustration_status: 'illustration_approved' })
        .eq('id', projectId)
        .then(() => {
          toast.success('Project status synchronized')
          // Project status update will be reflected via props on next server render
        })
    }
  }, [localProjectStatus, illustrationStatus, projectId, router])

  // Automatic Switch to Illustrations Tab on Approval
  const prevStatusRef = useRef(localProjectStatus)
  useEffect(() => {
    const isApprovalTransition = prevStatusRef.current !== 'characters_approved' && localProjectStatus === 'characters_approved'
    const isCharactersTab = searchParams?.get('tab') === 'characters' || (!searchParams?.get('tab') && (localProjectStatus === 'character_review' || localProjectStatus === 'character_generation'))

    if (isApprovalTransition && isCharactersTab) {
      toast.success('Characters Approved! Switching to Illustrations...')
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('tab', 'illustrations')
      router.replace(`${pathname}?${params.toString()}`)
    }

    prevStatusRef.current = localProjectStatus
  }, [localProjectStatus, searchParams, router, pathname])

  // Admin polling - Check for customer submission AND generation completion
  useEffect(() => {
    // Poll when:
    // 1. In character_review (waiting for customer to submit)
    // 2. In character_generation (waiting for generation to complete)
    const shouldPoll = localProjectStatus === 'character_review' || 
                       localProjectStatus === 'character_generation'
    
    if (!shouldPoll) return

    const interval = setInterval(() => {
      router.refresh()
    }, 3000)

    return () => clearInterval(interval)
  }, [localProjectStatus, router])

  // 1. Determine Active Tab (Hoist to top)
  const activeTab = useMemo(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'illustrations') return 'illustrations'
    if (tab === 'characters') return 'characters'
    if (tab === 'pages') return 'pages'

    // Default tab logic based on status
    if (isIllustrationsUnlocked) return 'illustrations'
    if (localProjectStatus === 'character_review' || localProjectStatus === 'character_generation' || localProjectStatus === 'draft') return 'characters'
    return 'pages'
  }, [searchParams, isIllustrationsUnlocked, localProjectStatus])

  const isPagesActive = activeTab === 'pages'
  const isCharactersActive = activeTab === 'characters'
  const isIllustrationsActive = activeTab === 'illustrations'

  // 2. Determine Sidebar State
  const showPagesSidebar = isPagesActive
  const showIllustrationsSidebar = isIllustrationsActive
  const showSidebar = showPagesSidebar || showIllustrationsSidebar

  const isGenerating = localProjectStatus === 'character_generation'
  const isCharactersLoading = isGenerating
  const isAnalyzing = illustrationStatus === 'analyzing'

  const pageCount = pages?.length || 0
  const characterCount = localCharacters?.length || 0

  // Sort characters
  const sortedCharacters = useMemo(() => {
    if (!localCharacters) return { main: null, secondary: [] }
    const sorted = [...localCharacters].sort((a, b) => {
      if (a.is_main && !b.is_main) return -1
      if (!a.is_main && b.is_main) return 1
      if (!a.is_main && !b.is_main) {
        return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
      }
      return 0
    })
    return { main: sorted.find(c => c.is_main) || null, secondary: sorted.filter(c => !c.is_main) }
  }, [localCharacters])



  // Manual Mode State
  const [isManualMode, setIsManualMode] = useState(false)
  const [characterForms, setCharacterForms] = useState<{ [id: string]: { data: any; isValid: boolean } }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleManualTrialApprove = async () => {
    if (!confirm("Are you sure you want to manually approve the 1st illustration? This will unlock all pages for generation.")) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/illustration-manual-approve`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Approval failed')
      toast.success('Illustration trial manually approved')
      router.refresh()
    } catch (e) {
      toast.error('Failed to approve trial')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Initialize forms when entering manual mode (or when characters load)
  useEffect(() => {
    if (localCharacters && localCharacters.length > 0) {
      const initialForms: Record<string, { data: any; isValid: boolean }> = {}
      localCharacters.forEach(char => {
        if (!char.is_main) {
          const isValid = !!(char.name && char.age && char.gender)
          initialForms[char.id] = { data: char, isValid }
        }
      })
      setCharacterForms(prev => {
        if (Object.keys(prev).length === 0 && Object.keys(initialForms).length > 0) return initialForms
        return prev
      })
    }
  }, [characters])

  const handleCharacterFormChange = (id: string, data: any, isValid: boolean) => {
    setCharacterForms(prev => ({ ...prev, [id]: { data, isValid } }))
  }

  const isManualSubmitValid = useMemo(() => {
    if (!sortedCharacters.secondary.length) return false
    return sortedCharacters.secondary.every(char => {
      const form = characterForms[char.id]
      return form && form.isValid
    })
  }, [sortedCharacters.secondary, characterForms])

  const handleManualSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Collect edits
      const characterEdits = Object.entries(characterForms).reduce((acc, [id, info]) => {
        acc[id] = info.data
        return acc
      }, {} as Record<string, any>)

      const response = await fetch(`/api/admin/projects/${projectId}/characters/manual-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterEdits })
      })

      if (!response.ok) throw new Error('Submission failed')

      toast.success('Manual submission successful')
      setIsManualMode(false)
      router.refresh()
    } catch (e) {
      toast.error('Failed to submit')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleManualApprove = async () => {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/characters/manual-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterEdits: {} }) // No edits, just proceed
      })
      if (!response.ok) throw new Error('Approval failed')
      toast.success('Characters manually approved')
      setIsManualMode(false)
      router.refresh()
    } catch (e) {
      toast.error('Failed to approve')
    } finally {
      setIsSubmitting(false)
    }
  }

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



  const showGallery = useMemo(() => {
    // Show gallery if:
    // 1. Any secondary character has an image (normal case)
    // 2. OR we're generating (so we can show cards with loading spinners)
    const hasImages = sortedCharacters.secondary.some(c => c.image_url !== null && c.image_url !== '')
    const isGeneratingOrComplete = localProjectStatus === 'character_generation' || localProjectStatus === 'character_generation_complete'
    return hasImages || (isGeneratingOrComplete && sortedCharacters.secondary.length > 0)
  }, [sortedCharacters.secondary, localProjectStatus])

  // Realtime subscription for character updates
  useEffect(() => {
    const supabase = createClient()
    const channelName = `admin-project-characters-${projectId}`
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updatedChar = payload.new as Character
          setLocalCharacters(prev => prev.map(c => c.id === updatedChar.id ? { ...c, ...updatedChar } : c))
          
          // Toast for new image generation
          const oldChar = payload.old as any
          if (updatedChar.image_url && !oldChar.image_url) {
            toast.success('New character illustration ready', { description: `${updatedChar.name || updatedChar.role} has been generated.` })
          }
          
          // Toast for new customer feedback
          if (updatedChar.feedback_notes && !oldChar.feedback_notes) {
            toast.info('Customer feedback received', { description: `${updatedChar.name || updatedChar.role} has feedback.` })
          }
        }
        if (payload.eventType === 'INSERT' && payload.new) {
          setLocalCharacters(prev => [...prev, payload.new as Character])
          toast.info('New character added')
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, router])

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
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, router])

  // Calculate Trial Readiness
  const isTrialReady = useMemo(() => {
    const page1 = localPages.find(p => p.page_number === 1)
    return !!(page1?.illustration_url && page1?.sketch_url)
  }, [localPages])

  // No full-page loading - show character gallery with individual card spinners instead



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
            status: (localProjectStatus as ProjectStatus) || 'draft',
            character_send_count: projectInfo.character_send_count || 0,
            illustration_send_count: projectInfo.illustration_send_count || 0,
            review_token: projectInfo.review_token
          }}
          pageCount={pageCount}
          characterCount={characterCount}
          hasImages={sortedCharacters.secondary.some(c => c.image_url !== null && c.image_url !== '')}
          hasUnresolvedFeedback={localCharacters.some(c => c.feedback_notes && !c.is_resolved)}
          isTrialReady={isTrialReady}
          generatedIllustrationCount={localPages.filter(p => !!p.illustration_url).length}
          onCreateIllustrations={() => {
            const params = new URLSearchParams(searchParams?.toString() || '')
            params.set('tab', 'illustrations')
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
          }}
          centerContent={
            // 1. Characters Manual Mode
            (activeTab === 'characters' && localCharacters && localCharacters.length > 1 && (
              <div className="flex items-center gap-2">
                {!isManualMode ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsManualMode(true)}
                    className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs px-3 shadow-sm"
                  >
                    Manual
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    <Button variant="ghost" size="sm" onClick={() => setIsManualMode(false)} className="h-7 text-xs px-2 text-slate-500 hover:text-slate-700">
                      Cancel
                    </Button>

                    <div className="h-4 w-px bg-slate-200" />

                    {sortedCharacters.secondary.every(c => c.image_url) ? (
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs px-3"
                        onClick={handleManualApprove}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Approve'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs px-3"
                        onClick={handleManualSubmit}
                        disabled={!isManualSubmitValid || isSubmitting}
                      >
                        {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Submit'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )) ||
            // 2. Illustration Trial Manual Approve
            (activeTab === 'illustrations' && isTrialReady && illustrationStatus !== 'illustration_approved' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleManualTrialApprove}
                className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs px-3 shadow-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Manual Approve Trial'}
              </Button>
            ))
          }
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
          {showGallery && localCharacters && !isManualMode ? (
            <AdminCharacterGallery
              characters={localCharacters}
              projectId={projectId}
              isGenerating={localProjectStatus === 'character_generation'}
            />
          ) : (
            <>
              {/* Manual mode controls moved to header */}

              {localCharacters && localCharacters.length > 0 ? (
                <div className="w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    {/* Main character form is no longer shown - main character data comes from uploaded image and story extraction */}
                    {localCharacters.length <= 1 && (
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
                      <CharacterCard
                        key={character.id}
                        character={character}
                        readOnly={!isManualMode}
                        onChange={handleCharacterFormChange}
                      />
                    ))}
                    {localCharacters.length > 1 && !isManualMode && (
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
          )
          }
        </div >

        {/* Illustrations Tab Content */}
        < div className={activeTab === 'illustrations' ? 'block space-y-4' : 'hidden'}>
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
        </div >
      </div >
    </UnifiedProjectLayout >
  )
}
