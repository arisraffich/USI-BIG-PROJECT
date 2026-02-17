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
import { Loader2, Sparkles, Upload, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IllustrationsTabContent } from '@/components/admin/IllustrationsTabContent'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { ProjectStatus } from '@/types/project'
import { CharacterFormData } from '@/components/shared/UniversalCharacterCard'
import { getErrorMessage } from '@/lib/utils/error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ProjectTabsContentProps {
  projectId: string
  pages: Page[] | null
  characters: Character[] | null
  projectStatus?: string
  projectInfo?: any
}

export function ProjectTabsContent({
  projectId,
  pages,
  characters,
  projectStatus,
  projectInfo
}: ProjectTabsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Local state for characters to support instant realtime updates
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters || [])
  
  // Local state for project status to support instant realtime updates
  const [localProjectStatus, setLocalProjectStatus] = useState<string>(projectStatus || 'draft')
  
  // Page errors state (shared between IllustrationsTabContent and sidebar)
  const [pageErrors, setPageErrors] = useState<{ [pageId: string]: { message: string; technicalDetails: string } }>({})
  
  // Generating page IDs state (shared between IllustrationsTabContent and sidebar for orange dots)
  const [generatingPageIds, setGeneratingPageIds] = useState<string[]>([])

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

  // Check if Illustrations are unlocked (must match isInIllustrationPhase in ProjectHeader.tsx)
  const isIllustrationsUnlocked = [
    'characters_approved',
    'sketches_review', 'sketches_revision',
    'illustration_approved',
    'completed',
    // Legacy statuses (migration compatibility)
    'trial_review', 'trial_revision', 'trial_approved',
    'illustrations_generating',
    'illustration_review', 'illustration_revision_needed',
    'sketch_generation', 'sketch_ready',
  ].includes(localProjectStatus)

  // Auto-heal status mismatch - REMOVED: illustration_status field no longer used

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

  // Admin polling - ONLY when waiting for generation to complete
  // DO NOT poll during character_review (admin may be manually filling forms - polling would reset their input!)
  useEffect(() => {
    // Poll ONLY when status is character_generation (waiting for AI to finish)
    if (localProjectStatus !== 'character_generation') return

    const interval = setInterval(() => {
      router.refresh()
    }, 3000)

    return () => clearInterval(interval)
  }, [localProjectStatus, router])

  // Check if there are secondary characters (more than just main character)
  const hasSecondaryCharacters = localCharacters && localCharacters.length > 1

  // 1. Determine Active Tab (Hoist to top)
  const activeTab = useMemo(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'illustrations') return 'illustrations'
    // Only allow characters tab if there are secondary characters
    if (tab === 'characters' && hasSecondaryCharacters) return 'characters'
    if (tab === 'pages') return 'pages'

    // Default tab logic based on status
    if (isIllustrationsUnlocked) return 'illustrations'
    // Only default to characters if there are secondary characters
    if (hasSecondaryCharacters && (localProjectStatus === 'character_review' || localProjectStatus === 'character_generation' || localProjectStatus === 'draft')) return 'characters'
    return 'pages'
  }, [searchParams, isIllustrationsUnlocked, localProjectStatus, hasSecondaryCharacters])

  const isPagesActive = activeTab === 'pages'
  const isCharactersActive = activeTab === 'characters'
  const isIllustrationsActive = activeTab === 'illustrations'

  // 2. Determine Sidebar State
  const showPagesSidebar = isPagesActive
  const showIllustrationsSidebar = isIllustrationsActive
  const showSidebar = showPagesSidebar || showIllustrationsSidebar

  const isGenerating = localProjectStatus === 'character_generation'
  const isSketchPhase = localProjectStatus === 'character_generation_complete'
  const isCharactersLoading = isGenerating
  // NOTE: isAnalyzing removed - illustration_status field no longer used
  const isAnalyzing = false

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
  
  
  // Push Characters to Customer State
  const [isCharPushDialogOpen, setIsCharPushDialogOpen] = useState(false)
  const [isCharPushing, setIsCharPushing] = useState(false)

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

  // Skip to Illustrations (when no secondary characters found)
  const handleSkipToIllustrations = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({ status: 'characters_approved' })
        .eq('id', projectId)

      if (error) throw error

      toast.success('Skipped to illustrations stage')
      setLocalProjectStatus('characters_approved')
      
      // Switch to illustrations tab
      startTransition(() => {
        router.replace(`${pathname}?tab=illustrations`)
      })
      router.refresh()
    } catch (e) {
      console.error('Failed to skip to illustrations:', e)
      toast.error('Failed to skip to illustrations')
    }
  }

  // Push Characters to Customer (Silent Update)
  const handlePushCharactersToCustomer = async () => {
    setIsCharPushing(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/push-characters-to-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Push failed')
      }
      
      const result = await response.json()
      toast.success(result.message || 'Characters pushed to customer')
      setIsCharPushDialogOpen(false)
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'Failed to push characters'))
    } finally {
      setIsCharPushing(false)
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

  // NOTE: Analysis Loop removed - illustration_status field no longer used
  // Character actions are now extracted on-demand during illustration generation

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
          hasUnresolvedFeedback={
            localCharacters.some(c => c.feedback_notes && !c.is_resolved) ||
            localPages.some(p => p.feedback_notes && !p.is_resolved)
          }
          hasResolvedFeedback={
            localCharacters.some(c => c.feedback_notes && c.is_resolved) ||
            localPages.some(p => p.feedback_notes && p.is_resolved)
          }
          isTrialReady={isTrialReady}
          generatedIllustrationCount={localPages.filter(p => !!p.illustration_url).length}
          onCreateIllustrations={() => {
            const params = new URLSearchParams(searchParams?.toString() || '')
            params.set('tab', 'illustrations')
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
          }}
          centerContent={
            <>
              {/* Characters Manual Mode + Push Button */}
              {activeTab === 'characters' && localCharacters && localCharacters.length > 1 && (
                <div className="flex items-center gap-2">
                  {!isManualMode ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setIsManualMode(true)}
                        className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs px-3 shadow-sm"
                      >
                        Manual
                      </Button>
                      
                      {/* Push Characters Button - only show after characters sent */}
                      {(projectInfo?.character_send_count || 0) > 0 && (
                        <AlertDialog open={isCharPushDialogOpen} onOpenChange={setIsCharPushDialogOpen}>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs px-3 border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Upload className="w-3 h-3 mr-1.5" />
                              Push
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Push Characters to Customer?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will silently update all character images on the customer&apos;s side without sending any notifications. The customer will see the latest versions when they refresh or revisit the page.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isCharPushing}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handlePushCharactersToCustomer}
                                disabled={isCharPushing}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                {isCharPushing ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Pushing...
                                  </>
                                ) : (
                                  'Push Characters'
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </>
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
              )}
              
            </>
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
            projectStatus={localProjectStatus as any}
            illustrationSendCount={projectInfo?.illustration_send_count || 0}
            failedPageIds={Object.keys(pageErrors)}
            generatingPageIds={generatingPageIds}
          />
        ) : null
      }
    >
      {/* Main Content Area */}
      <div className={activeTab === 'illustrations' ? 'p-0 pb-0 pt-0' : 'p-8 pb-32'}>

        {/* Pages Tab Content */}
        <div className={activeTab === 'pages' ? 'block' : 'hidden'}>
          {/* Awaiting customer input banner */}
          {localProjectStatus === 'awaiting_customer_input' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center mb-6">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-amber-900 text-lg">Waiting for Customer</h3>
                <p className="text-sm text-amber-700/80 max-w-md">
                  A submission link has been sent to the author. Once they submit their story text and character details, the project will automatically proceed to the next stage.
                </p>
              </div>
              {(() => {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
                const fullUrl = `${baseUrl}/submit/${projectInfo?.review_token}`
                return (
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full px-4 py-2 transition-colors"
                  >
                    <span className="font-mono truncate max-w-[400px]">{fullUrl}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                )
              })()}
            </div>
          )}
          {/* No secondary characters banner - show on Pages tab when stuck in character_review with no secondaries */}
          {localCharacters.length <= 1 && localProjectStatus === 'character_review' && sortedCharacters.secondary.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center mb-6">
              <div className="relative">
                <div className="relative bg-white rounded-full p-3 shadow-sm border border-blue-200">
                  <Sparkles className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-blue-900 text-lg">No Secondary Characters Found</h3>
                <p className="text-sm text-blue-700/80 max-w-[320px]">
                  The AI did not identify any secondary characters in this story. You can proceed directly to illustrations or manually add characters.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 w-full sm:w-auto px-4 sm:px-0">
                <AddCharacterButton
                  mode="button"
                  forceShow
                  mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
                  className="w-full sm:w-auto h-11 px-5 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-medium"
                />
                <Button 
                  onClick={handleSkipToIllustrations}
                  className="w-full sm:w-auto h-11 px-5 bg-blue-600 hover:bg-blue-700"
                >
                  Proceed to Illustrations
                </Button>
              </div>
            </div>
          )}
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
              isSketchPhase={isSketchPhase}
            />
          ) : (
            <>
              {/* Manual mode controls moved to header */}

              {localCharacters && localCharacters.length > 0 ? (
                <div className="w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    {/* Main character form is no longer shown - main character data comes from uploaded image and story extraction */}
                    {/* Show different UI based on whether analysis is complete or still running */}
                    {localCharacters.length <= 1 && localProjectStatus === 'draft' && (
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
                    {/* No secondary characters found - show skip option */}
                    {localCharacters.length <= 1 && localProjectStatus === 'character_review' && sortedCharacters.secondary.length === 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center min-h-[300px] col-span-full">
                        <div className="relative">
                          <div className="relative bg-white rounded-full p-3 shadow-sm border border-blue-200">
                            <Sparkles className="w-6 h-6 text-blue-500" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-semibold text-blue-900 text-lg">No Secondary Characters Found</h3>
                          <p className="text-sm text-blue-700/80 max-w-[320px]">
                            The AI did not identify any secondary characters in this story. You can proceed directly to illustrations or manually add characters.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 w-full sm:w-auto px-4 sm:px-0">
                          <AddCharacterButton
                            mode="button"
                            mainCharacterName={sortedCharacters.main?.name || sortedCharacters.main?.role || null}
                            className="w-full sm:w-auto h-11 px-5 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-medium"
                          />
                          <Button 
                            onClick={handleSkipToIllustrations}
                            className="w-full sm:w-auto h-11 px-5 bg-blue-600 hover:bg-blue-700"
                          >
                            Proceed to Illustrations
                          </Button>
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
            characters={localCharacters}
            projectStatus={localProjectStatus}
            isAnalyzing={isAnalyzing}
            analysisProgress={analysisProgress}
            initialAspectRatio={projectInfo?.illustration_aspect_ratio}
            initialTextIntegration={projectInfo?.illustration_text_integration}
            activePageId={activeIllustrationPageId}
            onPageChange={setActiveIllustrationPageId}
            pageErrors={pageErrors}
            onPageErrorsChange={setPageErrors}
            onGeneratingPageIdsChange={setGeneratingPageIds}
          />
        </div >
      </div >
    </UnifiedProjectLayout >
  )
}
