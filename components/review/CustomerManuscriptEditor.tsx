'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { CustomerManuscriptPage } from './CustomerManuscriptPage'
import { ManuscriptSidebar } from '@/components/project/manuscript/ManuscriptSidebar'
import { ManuscriptToolbar } from '@/components/project/manuscript/ManuscriptToolbar'
import { toast } from 'sonner'
import { Page } from '@/types/page'

interface CustomerManuscriptEditorProps {
  pages: Page[] | null
  projectId: string
  onEditsChange?: (edits: PageEdits) => void
}

type PageEdits = {
  [pageId: string]: {
    story_text?: string
    scene_description?: string
  }
}

export function CustomerManuscriptEditor({ pages, projectId, onEditsChange }: CustomerManuscriptEditorProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const isManualScrollRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)

  // Store original server state (for comparison to show red text)
  // This is the baseline - never changes, represents text before any customer edits
  // Initialize as empty array - useEffect will populate it from original_story_text
  const baselinePagesRef = useRef<Page[]>([])

  // Track displayed pages (updated after save with flags)
  const [displayedPages, setDisplayedPages] = useState<Page[]>(pages || [])

  // Store local edits (will be saved on submit)
  const [pageEdits, setPageEdits] = useState<PageEdits>({})

  // Notify parent of edits changes
  useEffect(() => {
    if (onEditsChange) {
      onEditsChange(pageEdits)
    }
  }, [pageEdits, onEditsChange])

  // Update displayed pages when prop changes, and set baseline from original_story_text
  useEffect(() => {
    if (pages && pages.length > 0) {
      // Build baseline from original_story_text (if available) or keep existing baseline
      const newBaseline = pages.map(p => {
        const originalStoryText = p.original_story_text
        const originalSceneDesc = p.original_scene_description

        // CRITICAL: If original_story_text exists in DB, ALWAYS use it as baseline
        // This ensures highlighting persists after refresh
        if (originalStoryText !== undefined && originalStoryText !== null) {
          return {
            ...p,
            story_text: originalStoryText,
            scene_description: originalSceneDesc ?? null,
          }
        }

        // If no original_story_text yet, check if we already have a baseline for this page
        const existingBaseline = baselinePagesRef.current.find(bp => bp.id === p.id)
        if (existingBaseline) {
          // Keep existing baseline (preserves it until original_story_text is set in DB)
          return existingBaseline
        }

        // First time seeing this page and no original_story_text in DB yet
        // Use current text as temporary baseline (will be replaced when original_story_text is set)
        return {
          ...p,
          story_text: p.story_text ?? '',
          scene_description: p.scene_description ?? null,
        }
      })

      // CRITICAL FIX: Always update baseline when we have original_story_text from DB
      // This ensures baseline is restored correctly after refresh
      const hasOriginalTextInDb = pages.some(p => p.original_story_text !== undefined && p.original_story_text !== null)

      // Update baseline if:
      // 1. Baseline is empty (first load), OR
      // 2. We have original_story_text from DB (always restore from DB on refresh)
      if (baselinePagesRef.current.length === 0 || hasOriginalTextInDb) {
        baselinePagesRef.current = newBaseline
      } else {
        // Even if hasOriginalTextInDb is false, update baseline for pages that don't have existing baseline
        // This handles the case where new pages are added
        const updatedBaseline = baselinePagesRef.current.map(bp => {
          const newPage = newBaseline.find(np => np.id === bp.id)
          return newPage || bp
        })
        // Add any new pages that don't exist in baseline yet
        newBaseline.forEach(np => {
          if (!updatedBaseline.find(ub => ub.id === np.id)) {
            updatedBaseline.push(np)
          }
        })
        baselinePagesRef.current = updatedBaseline
      }

      // Always update displayed pages with latest from server
      setDisplayedPages(pages)
    }
  }, [pages, projectId])

  const handleStoryTextChange = useCallback((pageId: string, value: string) => {
    setPageEdits((prev) => {
      const originalPage = baselinePagesRef.current.find((p) => p.id === pageId)
      const originalStoryText = originalPage?.story_text || ''
      const originalSceneDesc = originalPage?.scene_description || ''

      // If value matches original, remove from edits
      if (value === originalStoryText) {
        const newEdits = { ...prev }
        if (newEdits[pageId]) {
          delete newEdits[pageId].story_text
          if (!newEdits[pageId].scene_description) {
            delete newEdits[pageId]
          }
        }
        // Remove pageId entry if it's now empty
        if (!newEdits[pageId] || Object.keys(newEdits[pageId]).length === 0) {
          const { [pageId]: _, ...rest } = newEdits
          return rest
        }
        return newEdits
      }

      // Add or update edit
      return {
        ...prev,
        [pageId]: {
          story_text: value,
          scene_description: prev[pageId]?.scene_description || originalSceneDesc,
        },
      }
    })
  }, [])

  const handleSceneDescriptionChange = useCallback((pageId: string, value: string) => {
    setPageEdits((prev) => {
      const originalPage = baselinePagesRef.current.find((p) => p.id === pageId)
      const originalStoryText = originalPage?.story_text || ''
      const originalSceneDesc = originalPage?.scene_description || ''

      // If value matches original, remove from edits
      if (value === originalSceneDesc) {
        const newEdits = { ...prev }
        if (newEdits[pageId]) {
          delete newEdits[pageId].scene_description
          if (!newEdits[pageId].story_text) {
            delete newEdits[pageId]
          }
        }
        // Remove pageId entry if it's now empty
        if (!newEdits[pageId] || Object.keys(newEdits[pageId]).length === 0) {
          const { [pageId]: _, ...rest } = newEdits
          return rest
        }
        return newEdits
      }

      // Add or update edit
      return {
        ...prev,
        [pageId]: {
          story_text: prev[pageId]?.story_text || originalStoryText,
          scene_description: value,
        },
      }
    })
  }, [])

  const handlePageClick = (pageId: string) => {
    const element = document.getElementById(`page-${pageId}`)
    if (element) {
      isManualScrollRef.current = true
      setActivePageId(pageId)
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => {
        isManualScrollRef.current = false
      }, 1000)
    }
  }

  const handleSave = useCallback(async () => {
    if (Object.keys(pageEdits).length === 0) {
      toast.info('No changes to save')
      return
    }

    setIsSaving(true)
    try {
      // Save each page edit to the database
      // Get current displayed values (baseline + edits)
      const pageUpdates = Object.entries(pageEdits).map(([pageId, edits]: [string, any]) => {
        const baselinePage = baselinePagesRef.current.find((p) => p.id === pageId)
        const currentStoryText = edits.story_text ?? baselinePage?.story_text ?? ''
        const currentSceneDesc = edits.scene_description ?? baselinePage?.scene_description ?? null

        // CRITICAL: Set flag if story_text was edited (compare with baseline)
        const storyTextWasEdited = edits.story_text !== undefined &&
          edits.story_text !== baselinePage?.story_text
        const sceneDescWasEdited = edits.scene_description !== undefined &&
          edits.scene_description !== (baselinePage?.scene_description || '')

        return {
          id: pageId,
          story_text: currentStoryText,
          scene_description: currentSceneDesc,
          is_customer_edited_story_text: storyTextWasEdited,
          is_customer_edited_scene_description: sceneDescWasEdited,
        }
      })

      // Save all edits in parallel
      const savePromises = pageUpdates.map(async (update) => {
        const response = await fetch(`/api/pages/${update.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            story_text: update.story_text,
            scene_description: update.scene_description,
            is_customer_edited_story_text: update.is_customer_edited_story_text,
            is_customer_edited_scene_description: update.is_customer_edited_scene_description,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || `Failed to save page ${update.id}`)
        }
      })

      await Promise.all(savePromises)

      // Fetch updated pages from server to get latest data with flags
      const updatedPageIds = pageUpdates.map(u => u.id)
      const fetchPromises = updatedPageIds.map(async (pageId) => {
        const response = await fetch(`/api/pages/${pageId}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch updated page ${pageId}`)
        }
        return response.json()
      })

      const fetchedPages = await Promise.all(fetchPromises)

      // Update displayed pages with fetched data (which includes the edit flags)
      // But keep baseline unchanged - it represents the original text before edits
      const updatedPages = displayedPages.map((page) => {
        const fetchedPage = fetchedPages.find((fp: Page) => fp.id === page.id)
        if (fetchedPage) {
          return fetchedPage
        }
        return page
      })
      setDisplayedPages(updatedPages)

      // Clear local edits
      setPageEdits({})
      // Exit edit mode to return to read-only view with red highlighting
      setIsEditMode(false)
      toast.success('Changes saved successfully')
    } catch (error: any) {
      console.error('Error saving changes:', error)
      toast.error(error.message || 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }, [pageEdits, displayedPages])

  // Scroll spy: Highlight active page based on scroll position
  useEffect(() => {
    if (!displayedPages || displayedPages.length === 0) return

    const observerOptions = {
      root: null,
      rootMargin: '-100px 0px -50% 0px',
      threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    }

    const pageVisibility = new Map<string, number>()

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        const pageId = entry.target.id.replace('page-', '')
        if (entry.isIntersecting) {
          pageVisibility.set(pageId, entry.intersectionRatio)
        } else {
          pageVisibility.delete(pageId)
        }
      })

      let bestPage: { id: string; ratio: number; top: number } | null = null

      pageVisibility.forEach((ratio, pageId) => {
        const element = document.getElementById(`page-${pageId}`)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top < window.innerHeight * 0.6) {
            if (!bestPage || ratio > bestPage.ratio || (ratio === bestPage.ratio && rect.top < bestPage.top)) {
              bestPage = { id: pageId, ratio, top: rect.top }
            }
          }
        }
      })

      if (!bestPage && pageVisibility.size > 0) {
        let maxRatio = 0
        let bestId = ''
        pageVisibility.forEach((ratio, pageId) => {
          if (ratio > maxRatio) {
            maxRatio = ratio
            bestId = pageId
          }
        })
        if (bestId) {
          bestPage = { id: bestId, ratio: maxRatio, top: 0 }
        }
      }

      if (bestPage && !isManualScrollRef.current) {
        setActivePageId(bestPage.id)
      }
    }

    const observer = new IntersectionObserver(observerCallback, observerOptions)

    const observePages = () => {
      displayedPages.forEach((page) => {
        const element = document.getElementById(`page-${page.id}`)
        if (element) {
          observer.observe(element)
        }
      })
    }

    const rafId = requestAnimationFrame(() => {
      observePages()
    })

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      pageVisibility.clear()
    }
  }, [displayedPages])

  if (!displayedPages || displayedPages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500 text-center">
          No pages yet. Pages will appear here after story parsing.
        </p>
      </div>
    )
  }

  // Get current page data (original + edits)
  const getPageData = (page: Page): Page => {
    const edits = pageEdits[page.id]
    if (!edits) return page

    return {
      ...page,
      story_text: edits.story_text ?? page.story_text,
      scene_description: edits.scene_description ?? page.scene_description ?? null,
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 -m-8">
      {/* Sidebar - Desktop Only */}
      <ManuscriptSidebar
        pages={displayedPages}
        activePageId={activePageId}
        onPageClick={handlePageClick}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:ml-[250px]">
        {/* Scrollable Content */}
        <div className="px-4 md:px-8 py-8 pb-24 md:pb-8">
          {/* Floating Command Bar */}
          <ManuscriptToolbar
            isEditMode={isEditMode}
            onEditClick={() => setIsEditMode(true)}
            onCancelClick={() => setIsEditMode(false)}
            onSaveClick={handleSave}
            isSaving={isSaving}
            isDirty={Object.keys(pageEdits).length > 0}
            isCustomerView={true}
          />

          {/* Page Cards */}
          {displayedPages.map((page) => {
            const pageData = getPageData(page)
            // Use baseline for comparison (original text before any customer edits)
            const baselinePage = baselinePagesRef.current.find((p) => p.id === page.id)
            // CRITICAL: Always prefer original_story_text from DB if available (for highlighting persistence)
            // This is the source of truth for what was originally sent to customer
            // Fallback to baseline only if original_story_text is truly not set
            const originalStoryText = (page.original_story_text !== undefined && page.original_story_text !== null && page.original_story_text !== '')
              ? page.original_story_text
              : (baselinePage?.story_text || '')
            const originalSceneDescription = (page.original_scene_description !== undefined && page.original_scene_description !== null && page.original_scene_description !== '')
              ? page.original_scene_description
              : (baselinePage?.scene_description || null)
            return (
              <div key={page.id} id={`page-${page.id}`}>
                <CustomerManuscriptPage
                  page={{
                    ...pageData,
                    scene_description: pageData.scene_description ?? null
                  }}
                  isEditMode={isEditMode}
                  originalStoryText={originalStoryText}
                  originalSceneDescription={originalSceneDescription}
                  onStoryTextChange={handleStoryTextChange}
                  onSceneDescriptionChange={handleSceneDescriptionChange}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}







