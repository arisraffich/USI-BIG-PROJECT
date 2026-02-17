'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { 
  ChevronLeft, ChevronRight, Check, Plus, Trash2, Loader2,
  BookOpen, PenLine, Users, PartyPopper, Sparkles, Pencil
} from 'lucide-react'
import { getErrorMessage } from '@/lib/utils/error'
import { Character } from '@/types/character'
import { CustomerCharacterCard } from '@/components/review/CustomerCharacterCard'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ============================================================================
// TYPES
// ============================================================================

interface PageData {
  pageNumber: number
  storyText: string
  sceneDescription: string
}

interface WizardState {
  pages: PageData[]
  sceneDescriptionChoice: 'yes' | 'no' | null
  currentStep: 'welcome' | 'story_text' | 'scene_choice' | 'scene_description' | 'loading_characters' | 'character_forms' | 'submitting' | 'thank_you'
  currentPageIndex: number
}

interface CustomerSubmissionWizardProps {
  projectId: string
  reviewToken: string
  authorFirstName: string
  authorLastName: string
  numberOfIllustrations: number
  existingPages: Array<{ page_number: number; story_text?: string; scene_description?: string }>
}

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

function getSavedState(projectId: string): Partial<WizardState> | null {
  try {
    const saved = localStorage.getItem(`wizard-${projectId}`)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function saveState(projectId: string, state: Partial<WizardState>) {
  try {
    localStorage.setItem(`wizard-${projectId}`, JSON.stringify(state))
  } catch {
    // localStorage might be full or disabled
  }
}

function clearSavedState(projectId: string) {
  try {
    localStorage.removeItem(`wizard-${projectId}`)
  } catch {
    // Ignore
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CustomerSubmissionWizard({
  projectId,
  reviewToken,
  authorFirstName,
  authorLastName,
  numberOfIllustrations,
  existingPages,
}: CustomerSubmissionWizardProps) {
  const authorName = `${authorFirstName} ${authorLastName}`.trim()
  const estimatedMinutes = Math.ceil(numberOfIllustrations * 1.5)

  // Initialize pages from existing data or create blank ones
  const createInitialPages = useCallback((): PageData[] => {
    const pages: PageData[] = []
    for (let i = 0; i < numberOfIllustrations; i++) {
      const existing = existingPages.find(p => p.page_number === i + 1)
      pages.push({
        pageNumber: i + 1,
        storyText: existing?.story_text || '',
        sceneDescription: existing?.scene_description || '',
      })
    }
    return pages
  }, [numberOfIllustrations, existingPages])

  // Start with defaults (SSR-safe) — localStorage restore happens after hydration
  const [pages, setPages] = useState<PageData[]>(createInitialPages)
  const [currentStep, setCurrentStep] = useState<WizardState['currentStep']>('welcome')
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0)
  const [sceneDescriptionChoice, setSceneDescriptionChoice] = useState<'yes' | 'no' | null>(null)

  const [identifiedCharacters, setIdentifiedCharacters] = useState<Character[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')

  // Background character identification — runs while customer fills scene descriptions
  const bgCharIdRef = useRef<{
    promise: Promise<{ characters: Character[] }> | null
    result: { characters: Character[] } | null
    error: string | null
    started: boolean
  }>({ promise: null, result: null, error: null, started: false })

  // Track which story text pages have been "saved" (collapsed/completed)
  const [savedPageIndices, setSavedPageIndices] = useState<Set<number>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const storyNavRef = useRef<HTMLDivElement>(null)

  // Restore from localStorage AFTER hydration to avoid SSR/client mismatch
  useEffect(() => {
    const saved = getSavedState(projectId)
    if (saved) {
      if (saved.pages && saved.pages.length > 0) setPages(saved.pages)
      if (saved.currentStep && saved.currentStep !== 'submitting' && saved.currentStep !== 'loading_characters') {
        setCurrentStep(saved.currentStep)
      }
      if (saved.currentPageIndex != null) setCurrentPageIndex(saved.currentPageIndex)
      if (saved.sceneDescriptionChoice) setSceneDescriptionChoice(saved.sceneDescriptionChoice)
      // Mark pages with text as saved/collapsed
      if (saved.pages) {
        const filledIndices = new Set<number>()
        saved.pages.forEach((p: PageData, i: number) => {
          if (p.storyText?.trim()) filledIndices.add(i)
        })
        setSavedPageIndices(filledIndices)
      }
    }
    setHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Auto-save to localStorage on every state change (only after hydration to avoid saving defaults)
  useEffect(() => {
    if (!hydrated) return
    saveState(projectId, {
      pages,
      currentStep,
      currentPageIndex,
      sceneDescriptionChoice,
    })
  }, [hydrated, projectId, pages, currentStep, currentPageIndex, sceneDescriptionChoice])

  // Scroll to top on step change, or to specific page card in story_text mode
  useEffect(() => {
    if (currentStep === 'story_text' || currentStep === 'scene_description') {
      const pageEl = document.getElementById(
        currentStep === 'story_text' ? `story-page-${currentPageIndex}` : `scene-page-${currentPageIndex}`
      )
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep, currentPageIndex])

  // Fetch characters from DB if we're on character_forms step but state is empty (e.g., page reload)
  useEffect(() => {
    if (currentStep === 'character_forms' && identifiedCharacters.length === 0 && hydrated) {
      (async () => {
        try {
          // GET just fetches existing characters from DB (no AI, instant)
          const res = await fetch(`/api/submit/${reviewToken}/identify-characters`)
          if (res.ok) {
            const data = await res.json()
            if (data.characters && data.characters.length > 0) {
              setIdentifiedCharacters(data.characters)
            }
          }
        } catch (err) {
          console.error('[Wizard] Failed to re-fetch characters:', err)
        }
      })()
    }
  }, [currentStep, identifiedCharacters.length, hydrated, reviewToken])

  // ============================================================================
  // PAGE MANAGEMENT
  // ============================================================================

  const updatePage = (index: number, field: 'storyText' | 'sceneDescription', value: string) => {
    setPages(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addPage = () => {
    setPages(prev => [
      ...prev,
      { pageNumber: prev.length + 1, storyText: '', sceneDescription: '' },
    ])
    // Navigate to the new page
    setCurrentPageIndex(pages.length)
  }

  const removePage = (index: number) => {
    if (pages.length <= numberOfIllustrations) {
      toast.error(`Cannot remove below ${numberOfIllustrations} pages`)
      return
    }
    setPages(prev => {
      const updated = prev.filter((_, i) => i !== index)
      // Renumber
      return updated.map((p, i) => ({ ...p, pageNumber: i + 1 }))
    })
    if (currentPageIndex >= pages.length - 1) {
      setCurrentPageIndex(Math.max(0, pages.length - 2))
    }
  }

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================

  const goToStoryText = () => {
    setCurrentStep('story_text')
    // If all pages are saved, keep them collapsed; otherwise go to first unsaved
    const firstUnsaved = pages.findIndex((_, i) => !savedPageIndices.has(i))
    setCurrentPageIndex(firstUnsaved !== -1 ? firstUnsaved : -1)
  }

  const finishStoryText = () => {
    // Check all pages have story text
    const emptyPages = pages.filter(p => !p.storyText.trim())
    if (emptyPages.length > 0) {
      toast.error(`Please fill in story text for all pages. ${emptyPages.length} page(s) are empty.`)
      setCurrentPageIndex(pages.findIndex(p => !p.storyText.trim()))
      return
    }

    // Start background: save pages to DB + identify characters silently
    if (!bgCharIdRef.current.started) {
      bgCharIdRef.current.started = true
      const bgPromise = (async () => {
        // Save pages (story text only — scene descriptions come later)
        await fetch(`/api/submit/${reviewToken}/save-pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pages: pages.map(p => ({
              page_number: p.pageNumber,
              story_text: p.storyText,
              scene_description: null,
            })),
            scene_description_choice: null,
          }),
        })
        // Identify characters (only needs story text)
        const identifyRes = await fetch(`/api/submit/${reviewToken}/identify-characters`, {
          method: 'POST',
        })
        if (!identifyRes.ok) throw new Error('Failed to identify characters')
        return await identifyRes.json()
      })()
        .then(data => {
          bgCharIdRef.current.result = data
          return data
        })
        .catch(err => {
          bgCharIdRef.current.error = getErrorMessage(err, 'Character identification failed')
          console.error('[BgCharId] Background character identification failed:', err)
          return { characters: [] }
        })
      bgCharIdRef.current.promise = bgPromise
    }

    setCurrentStep('scene_choice')
  }

  const handleSceneChoice = (choice: 'yes' | 'no') => {
    setSceneDescriptionChoice(choice)
    if (choice === 'yes') {
      setCurrentStep('scene_description')
      setCurrentPageIndex(0)
    } else {
      // Skip scene descriptions — use background result or wait for it
      handleIdentifyCharacters()
    }
  }

  const finishSceneDescriptions = () => {
    // Check all pages have scene descriptions
    const emptyPages = pages.filter(p => !p.sceneDescription.trim())
    if (emptyPages.length > 0) {
      toast.error(`Please add a scene description for all pages. ${emptyPages.length} page(s) are empty.`)
      setCurrentPageIndex(pages.findIndex(p => !p.sceneDescription.trim()))
      return
    }
    handleIdentifyCharacters()
  }

  // ============================================================================
  // CHARACTER IDENTIFICATION
  // ============================================================================

  const handleIdentifyCharacters = async () => {
    setCurrentStep('loading_characters')
    setIsLoading(true)

    try {
      // Step 1: Re-save pages with scene descriptions (updates the initial save)
      setLoadingMessage('Saving your pages...')
      const saveResponse = await fetch(`/api/submit/${reviewToken}/save-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pages: pages.map(p => ({
            page_number: p.pageNumber,
            story_text: p.storyText,
            scene_description: p.sceneDescription || null,
          })),
          scene_description_choice: sceneDescriptionChoice,
        }),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to save pages')
      }

      // Step 2: Use background character identification result if available
      let characters: Character[] = []
      const bg = bgCharIdRef.current

      if (bg.result) {
        // Background already finished — use cached result instantly
        console.log('[CharId] Using background result (instant)')
        characters = bg.result.characters || []
      } else if (bg.promise) {
        // Background still running — wait for it
        setLoadingMessage('Preparing character forms...')
        const data = await bg.promise
        characters = data.characters || []
      } else {
        // Background never started (shouldn't happen, but fallback)
        setLoadingMessage('Analyzing your story for characters...')
        const identifyResponse = await fetch(`/api/submit/${reviewToken}/identify-characters`, {
          method: 'POST',
        })
        if (!identifyResponse.ok) throw new Error('Failed to identify characters')
        const data = await identifyResponse.json()
        characters = data.characters || []
      }

      if (bg.error && characters.length === 0) {
        throw new Error(bg.error)
      }

      if (characters.length > 0) {
        setIdentifiedCharacters(characters)
        setCurrentStep('character_forms')
      } else {
        // No secondary characters found — submit directly
        await handleFinalSubmission()
      }
    } catch (error: unknown) {
      console.error('Character identification error:', error)
      toast.error(getErrorMessage(error, 'Something went wrong. Please try again.'))
      // Reset background state so retry can work
      bgCharIdRef.current = { promise: null, result: null, error: null, started: false }
      setCurrentStep('scene_choice')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================================================
  // FINAL SUBMISSION
  // ============================================================================

  const handleFinalSubmission = async () => {
    setCurrentStep('submitting')
    setIsLoading(true)
    setLoadingMessage('Submitting your project...')

    try {
      // Character data is already saved per-card via PATCH /api/review/characters/:id
      const response = await fetch(`/api/submit/${reviewToken}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterEdits: {} }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit project')
      }

      clearSavedState(projectId)
      setCurrentStep('thank_you')
    } catch (error: unknown) {
      console.error('Submission error:', error)
      toast.error(getErrorMessage(error, 'Failed to submit. Please try again.'))
      setCurrentStep('character_forms')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================================================
  // CHARACTER FORM LOGIC (reuses existing UniversalCharacterCard flow)
  // ============================================================================

  // Track form validity for progress display (updates on every keystroke)
  const [characterFormStates, setCharacterFormStates] = useState<Record<string, { isValid: boolean }>>({})
  // Track which characters have been SAVED (only updates on Save button click)
  const [savedCharacterIds, setSavedCharacterIds] = useState<Set<string>>(new Set())

  const handleCharacterChange = useCallback((id: string, _data: unknown, isValid: boolean) => {
    setCharacterFormStates(prev => ({
      ...prev,
      [id]: { isValid },
    }))
  }, [])

  const handleCharacterSaved = useCallback((id: string) => {
    setSavedCharacterIds(prev => new Set(prev).add(id))
  }, [])

  // activeFormIndex based on SAVED state (not just filled)
  const { activeFormIndex, completedCount, totalForms } = useMemo(() => {
    const total = identifiedCharacters.length
    let firstUnsaved = -1
    let completed = 0
    for (let i = 0; i < identifiedCharacters.length; i++) {
      if (savedCharacterIds.has(identifiedCharacters[i].id)) {
        completed++
      } else if (firstUnsaved === -1) {
        firstUnsaved = i
      }
    }
    return {
      activeFormIndex: firstUnsaved === -1 ? total : firstUnsaved,
      completedCount: completed,
      totalForms: total,
    }
  }, [identifiedCharacters, savedCharacterIds])

  const allCharacterFormsComplete = completedCount === totalForms && totalForms > 0

  // Completion popup — shown when all character forms are saved
  const [showCompletionPopup, setShowCompletionPopup] = useState(false)
  const completionPopupShown = useRef(false)

  useEffect(() => {
    if (allCharacterFormsComplete && currentStep === 'character_forms' && !completionPopupShown.current) {
      completionPopupShown.current = true
      setShowCompletionPopup(true)
    }
  }, [allCharacterFormsComplete, currentStep])

  // ============================================================================
  // PROGRESS BAR
  // ============================================================================

  const steps = [
    { key: 'story_text', label: 'Story Text', icon: BookOpen },
    { key: 'scene_description', label: 'Scene Description', icon: PenLine },
    { key: 'character_forms', label: 'Characters', icon: Users },
  ] as const

  const getStepStatus = (stepKey: string): 'completed' | 'active' | 'upcoming' => {
    const stepOrder = ['welcome', 'story_text', 'scene_choice', 'scene_description', 'loading_characters', 'character_forms', 'submitting', 'thank_you']
    const currentIndex = stepOrder.indexOf(currentStep)
    
    if (stepKey === 'story_text') {
      if (currentIndex >= stepOrder.indexOf('scene_choice')) return 'completed'
      if (currentStep === 'story_text') return 'active'
      return 'upcoming'
    }
    if (stepKey === 'scene_description') {
      if (currentIndex >= stepOrder.indexOf('loading_characters')) return 'completed'
      if (currentStep === 'scene_choice' || currentStep === 'scene_description') return 'active'
      return 'upcoming'
    }
    if (stepKey === 'character_forms') {
      if (currentStep === 'thank_you' || currentStep === 'submitting') return 'completed'
      if (currentStep === 'character_forms' || currentStep === 'loading_characters') return 'active'
      return 'upcoming'
    }
    return 'upcoming'
  }

  const showProgressBar = !['welcome', 'thank_you'].includes(currentStep)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Progress Bar */}
      {showProgressBar && (
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const status = getStepStatus(step.key)
                // Hide characters step if we haven't found any yet and we're before that step
                if (step.key === 'character_forms' && identifiedCharacters.length === 0 && 
                    !['character_forms', 'loading_characters', 'submitting', 'thank_you'].includes(currentStep)) {
                  return null
                }
                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                        status === 'completed' && 'bg-green-500 text-white',
                        status === 'active' && 'bg-indigo-600 text-white ring-2 ring-indigo-200',
                        status === 'upcoming' && 'bg-gray-200 text-gray-500',
                      )}>
                        {status === 'completed' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <step.icon className="w-4 h-4" />
                        )}
                      </div>
                      <span className={cn(
                        'text-xs font-medium hidden sm:block',
                        status === 'completed' && 'text-green-700',
                        status === 'active' && 'text-indigo-700',
                        status === 'upcoming' && 'text-gray-400',
                      )}>
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={cn(
                        'flex-1 h-0.5 mx-3',
                        status === 'completed' ? 'bg-green-500' : 'bg-gray-200',
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div ref={contentRef} className={cn(
        'transition-all duration-300',
        currentStep === 'character_forms' ? 'px-3 sm:px-6 md:px-8 py-8' : 'max-w-2xl mx-auto px-4 py-8',
      )}>
        {/* ================================================================ */}
        {/* WELCOME SCREEN */}
        {/* ================================================================ */}
        {currentStep === 'welcome' && (
          <div className="text-center py-12 animate-fadeIn">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-indigo-600" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              Welcome, {authorFirstName}!
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
              Let&apos;s get your project started! We&apos;ll walk you through three simple steps:
            </p>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8 text-left max-w-md mx-auto">
              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-indigo-600">1</span>
                  </div>
                  <span>Adding a story text for each page of your book</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-indigo-600">2</span>
                  </div>
                  <span>Creating scene descriptions for each illustration</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-indigo-600">3</span>
                  </div>
                  <span>Visual details for secondary characters (if any)</span>
                </li>
              </ul>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Estimated time: ~{estimatedMinutes} minutes &bull; {numberOfIllustrations} illustrations &bull; Progress auto-saved
                </p>
              </div>
            </div>

            <Button
              onClick={goToStoryText}
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              Let&apos;s Get Started
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STORY TEXT ENTRY — Progressive accordion */}
        {/* ================================================================ */}
        {currentStep === 'story_text' && (
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Story Text</h2>
              <p className="text-gray-500 text-sm">
                Fill in your story text page by page. {savedPageIndices.size} of {pages.length} saved.
              </p>
            </div>

            {/* All pages stacked vertically */}
            <div className="space-y-3 mb-6">
              {pages.map((page, index) => {
                const isSaved = savedPageIndices.has(index)
                const isActive = index === currentPageIndex && !isSaved
                const isEditing = index === currentPageIndex && isSaved // re-opened for editing
                const isExpanded = isActive || isEditing
                // Lock pages that come after the first unsaved page (unless they are already saved)
                const firstUnsavedIndex = pages.findIndex((_, i) => !savedPageIndices.has(i))
                const isLocked = !isSaved && firstUnsavedIndex !== -1 && index > firstUnsavedIndex

                return (
                  <div
                    key={index}
                    id={`story-page-${index}`}
                    className={cn(
                      'rounded-2xl border transition-all duration-300',
                      // Active / editing — expanded
                      isExpanded && 'bg-white border-indigo-300 shadow-md ring-2 ring-indigo-100 p-5',
                      // Saved & collapsed
                      isSaved && !isExpanded && 'bg-gray-50 border-gray-200 shadow-sm px-5 py-4',
                      // Locked
                      isLocked && 'bg-white border-gray-100 opacity-35 blur-[1px] p-5',
                      // Unsaved but next in line (shouldn't really happen, but safe)
                      !isExpanded && !isSaved && !isLocked && 'bg-white border-gray-200 shadow-sm p-5',
                    )}
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                          isSaved ? 'bg-green-100 text-green-600' :
                          isExpanded ? 'bg-indigo-100 text-indigo-700' :
                          'bg-gray-100 text-gray-400',
                        )}>
                          {isSaved ? <Check className="w-3.5 h-3.5" /> : page.pageNumber}
                        </div>
                        <h3 className={cn(
                          'font-semibold text-sm',
                          isExpanded ? 'text-gray-900' :
                          isSaved ? 'text-gray-600' : 'text-gray-400',
                        )}>
                          Page {page.pageNumber}
                        </h3>
                        {/* Collapsed preview of saved text */}
                        {isSaved && !isExpanded && (
                          <p className="text-xs text-gray-400 truncate max-w-[280px] sm:max-w-[400px] hidden sm:block">
                            — {page.storyText.trim().slice(0, 80)}{page.storyText.trim().length > 80 ? '...' : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Edit button on saved/collapsed cards */}
                        {isSaved && !isExpanded && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSavedPageIndices(prev => { const n = new Set(prev); n.delete(index); return n })
                              setCurrentPageIndex(index)
                            }}
                            className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 h-7 px-2"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {/* Delete button for extra pages */}
                        {index >= numberOfIllustrations && !isLocked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              // Also remove from saved set, adjusting indices
                              setSavedPageIndices(prev => {
                                const n = new Set<number>()
                                prev.forEach(i => {
                                  if (i < index) n.add(i)
                                  else if (i > index) n.add(i - 1)
                                })
                                return n
                              })
                              removePage(index)
                            }}
                            className="text-red-300 hover:text-red-600 hover:bg-red-50 h-7 px-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded content — textarea + save button */}
                    {isExpanded && (
                      <div className="mt-4 animate-fadeIn">
                        <Textarea
                          value={page.storyText}
                          onChange={(e) => updatePage(index, 'storyText', e.target.value)}
                          autoFocus
                          placeholder={`Paste or type the story text for page ${page.pageNumber}...`}
                          className="min-h-[140px] text-base leading-relaxed resize-none border-gray-200 focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className="flex items-center justify-between mt-3">
                          <div className="text-xs text-gray-400">
                            {page.storyText.trim() ? `${page.storyText.trim().split(/\s+/).length} words` : 'Required'}
                          </div>
                          <Button
                            size="sm"
                            disabled={!page.storyText.trim()}
                            onClick={() => {
                              // Save this page
                              setSavedPageIndices(prev => new Set(prev).add(index))
                              // Auto-advance to next unsaved page
                              const nextUnsaved = pages.findIndex((_, i) => i > index && !savedPageIndices.has(i) && i !== index)
                              if (nextUnsaved !== -1) {
                                setCurrentPageIndex(nextUnsaved)
                              } else {
                                // All pages saved — deselect so the last card collapses too
                                setCurrentPageIndex(-1)
                                // Scroll down to show the Continue button
                                setTimeout(() => {
                                  storyNavRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
                                }, 150)
                              }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4"
                          >
                            <Check className="w-3.5 h-3.5 mr-1.5" />
                            Save & Continue
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Locked placeholder */}
                    {isLocked && (
                      <div className="h-12 flex items-center justify-center text-gray-300 text-xs select-none mt-2">
                        Complete the page above first
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Add page + navigation */}
            <div ref={storyNavRef} className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep('welcome')}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPage}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Page
                </Button>
                
                <Button
                  onClick={finishStoryText}
                  disabled={savedPageIndices.size < pages.length}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SCENE DESCRIPTION CHOICE */}
        {/* ================================================================ */}
        {currentStep === 'scene_choice' && (
          <div className="text-center py-8 animate-fadeIn">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <PenLine className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Scene Descriptions</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Each page needs a scene description to help us compose the perfect illustration. You can write them yourself or let us create them from your story.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <button
                onClick={() => handleSceneChoice('yes')}
                className="bg-white rounded-2xl border-2 border-gray-200 p-6 text-left hover:border-indigo-400 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-200 transition-colors">
                  <PenLine className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">You will add the scene descriptions for all pages</h3>
                <p className="text-sm text-gray-500">Add your scene descriptions page by page</p>
              </button>

              <button
                onClick={() => handleSceneChoice('no')}
                className="bg-purple-50/50 rounded-2xl border-2 border-purple-300 p-6 text-left hover:border-purple-500 hover:shadow-md transition-all group ring-1 ring-purple-100 relative"
              >
                <span className="absolute -top-2.5 right-4 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                  Recommended
                </span>
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Our team will create them based on your story</h3>
                <p className="text-sm text-gray-500">We will craft the scene descriptions for you</p>
              </button>
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                setCurrentStep('story_text')
                // If all pages are saved, keep them collapsed; otherwise go to last unsaved
                const firstUnsaved = pages.findIndex((_, i) => !savedPageIndices.has(i))
                setCurrentPageIndex(firstUnsaved !== -1 ? firstUnsaved : -1)
              }}
              className="mt-6"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Story Text
            </Button>
          </div>
        )}

        {/* ================================================================ */}
        {/* SCENE DESCRIPTION CARDS */}
        {/* ================================================================ */}
        {currentStep === 'scene_description' && (
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Scene Descriptions</h2>
              <p className="text-gray-500 text-sm">
                Page {currentPageIndex + 1} of {pages.length}
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Page {pages[currentPageIndex].pageNumber}
                </h3>
                {pages[currentPageIndex].sceneDescription.trim() && (
                  <div className="flex items-center gap-1 text-green-600 text-xs">
                    <Check className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </div>
                )}
              </div>

              {/* Show story text as context */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Story Text</p>
                <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">
                  {pages[currentPageIndex].storyText}
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe the scene for this illustration
              </label>
              <Textarea
                value={pages[currentPageIndex].sceneDescription}
                onChange={(e) => updatePage(currentPageIndex, 'sceneDescription', e.target.value)}
                placeholder="Describe what you envision for this illustration... (e.g., 'Luna is sitting under a big oak tree reading a book, with butterflies around her')"
                className="min-h-[120px] text-base leading-relaxed resize-none focus:ring-2 focus:ring-purple-200 border-gray-200"
              />
              <p className="text-xs text-gray-400 mt-1">At least one sentence required</p>
            </div>

            {/* Page dots */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-6">
              {pages.map((page, index) => {
                // Allow navigating to: current, already-filled, or previous pages
                const canNavigate = index === currentPageIndex || index < currentPageIndex || page.sceneDescription.trim()
                return (
                  <button
                    key={index}
                    onClick={() => canNavigate && setCurrentPageIndex(index)}
                    disabled={!canNavigate}
                    className={cn(
                      'w-8 h-8 rounded-full text-xs font-medium transition-all',
                      index === currentPageIndex
                        ? 'bg-purple-600 text-white ring-2 ring-purple-200'
                        : page.sceneDescription.trim()
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : canNavigate
                            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            : 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-50',
                    )}
                  >
                    {page.pageNumber}
                  </button>
                )
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  if (currentPageIndex > 0) {
                    setCurrentPageIndex(currentPageIndex - 1)
                  } else {
                    setCurrentStep('scene_choice')
                  }
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {currentPageIndex === 0 ? 'Back' : 'Previous'}
              </Button>

              {currentPageIndex < pages.length - 1 ? (
                <Button
                  onClick={() => setCurrentPageIndex(currentPageIndex + 1)}
                  disabled={!pages[currentPageIndex].sceneDescription.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={finishSceneDescriptions}
                  disabled={!pages[currentPageIndex].sceneDescription.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* LOADING CHARACTERS */}
        {/* ================================================================ */}
        {(currentStep === 'loading_characters' || currentStep === 'submitting') && (
          <div className="text-center py-16 animate-fadeIn">
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
              <div className="absolute inset-3 rounded-full bg-indigo-50 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-indigo-600 animate-pulse" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {currentStep === 'submitting' ? 'Submitting Your Project' : 'Preparing Character Forms'}
            </h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              {loadingMessage || 'This may take a moment...'}
            </p>
          </div>
        )}

        {/* ================================================================ */}
        {/* CHARACTER FORMS — reuses existing CustomerCharacterCard */}
        {/* ================================================================ */}
        {currentStep === 'character_forms' && (
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1 flex items-center justify-center gap-2">
                <Users className="w-6 h-6 text-indigo-600" />
                Character Details
              </h2>
              <p className="text-gray-500 text-sm">
                Tell us about each character so our illustrators can bring them to life.
              </p>
            </div>

            {/* Character Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
              {identifiedCharacters.map((character, index) => (
                <CustomerCharacterCard
                  key={character.id}
                  character={character}
                  onChange={handleCharacterChange}
                  onSaved={handleCharacterSaved}
                  isLocked={index > activeFormIndex}
                  showSaveToast={false}
                />
              ))}
            </div>

            {/* Fixed Bottom Progress Bar + Navigation */}
            {totalForms > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg">
                <div className="w-full bg-gray-100 h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-1.5 transition-all duration-500 ease-out"
                    style={{ width: `${(completedCount / totalForms) * 100}%` }}
                  />
                </div>
                <div className="px-4 sm:px-8 py-3 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentStep(sceneDescriptionChoice === 'yes' ? 'scene_description' : 'scene_choice')}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>

                  <span className="text-sm font-medium text-gray-500">
                    {completedCount} of {totalForms} completed
                  </span>

                  <Button
                    size="sm"
                    onClick={handleFinalSubmission}
                    disabled={!allCharacterFormsComplete}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4 mr-1.5" />
                    Submit Project
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* THANK YOU SCREEN */}
        {/* ================================================================ */}
        {currentStep === 'thank_you' && (
          <div className="text-center py-12 animate-fadeIn">
            <div className="relative mx-auto w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-30" />
              <div className="relative w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
                <PartyPopper className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              You&apos;re All Set, {authorFirstName}!
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
              Thank you for submitting your project details. Our team will start working on your illustrations right away!
            </p>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-md mx-auto">
              <h3 className="font-semibold text-gray-900 mb-2">What happens next?</h3>
              <ul className="text-sm text-gray-600 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-indigo-600">1</span>
                  </div>
                  <span>Our illustrators create character designs based on your descriptions</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-indigo-600">2</span>
                  </div>
                  <span>You&apos;ll receive an email to review and approve the characters</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-indigo-600">3</span>
                  </div>
                  <span>Full scene illustrations are created and sent for your review</span>
                </li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">
                We&apos;ll send updates to your email. No need to keep this page open.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Character Forms Completion Popup */}
      <Dialog open={showCompletionPopup} onOpenChange={(open) => {
        if (!open) setShowCompletionPopup(false)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
              <PartyPopper className="w-6 h-6 text-green-600" />
              All Forms Complete!
            </DialogTitle>
            <DialogDescription className="text-center text-base pt-2">
              Thank you for filling out the character details. Ready to submit your project?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-center mt-4">
            <Button
              onClick={() => setShowCompletionPopup(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Review First
            </Button>
            <Button
              onClick={() => {
                setShowCompletionPopup(false)
                handleFinalSubmission()
              }}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold uppercase tracking-wide"
            >
              <Check className="w-4 h-4 mr-1.5" />
              Submit Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add fadeIn animation */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
