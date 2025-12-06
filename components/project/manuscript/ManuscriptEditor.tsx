'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ManuscriptPage } from './ManuscriptPage'
import { ManuscriptSidebar } from './ManuscriptSidebar'
import { ManuscriptToolbar } from './ManuscriptToolbar'

interface Page {
  id: string
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
  // Other fields from full Page type are ignored but allowed
  [key: string]: any
}

interface ManuscriptEditorProps {
  pages: Page[] | null
  projectId: string
}

type PageEdits = {
  [pageId: string]: {
    story_text?: string
    scene_description?: string
  }
}

export function ManuscriptEditor({ pages, projectId }: ManuscriptEditorProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showDiscardWarning, setShowDiscardWarning] = useState(false)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const isManualScrollRef = useRef(false)

  // Store original server state
  const originalPagesRef = useRef<Page[]>(pages || [])

  // Store local edits
  const [pageEdits, setPageEdits] = useState<PageEdits>({})

  // Check if there are unsaved changes
  const isDirty = Object.keys(pageEdits).length > 0

  // Update original pages when prop changes
  if (pages && pages !== originalPagesRef.current) {
    originalPagesRef.current = pages
  }

  const handleStoryTextChange = useCallback((pageId: string, value: string) => {
    setPageEdits((prev) => {
      const originalPage = originalPagesRef.current.find((p) => p.id === pageId)
      const originalStoryText = originalPage?.story_text || ''
      const originalSceneDesc = originalPage?.scene_description || ''

      // If value matches original, remove from edits
      if (value === originalStoryText) {
        const newEdits = { ...prev }
        if (newEdits[pageId]) {
          delete newEdits[pageId].story_text
          // If no edits left for this page, remove the page entirely
          if (!newEdits[pageId].scene_description) {
            delete newEdits[pageId]
          } else {
            // Keep scene_description if it exists
            newEdits[pageId] = {
              story_text: originalStoryText,
              scene_description: newEdits[pageId].scene_description,
            }
          }
        }
        return Object.keys(newEdits[pageId] || {}).length > 0
          ? { ...newEdits }
          : Object.fromEntries(
            Object.entries(newEdits).filter(([id]) => id !== pageId)
          )
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
      const originalPage = originalPagesRef.current.find((p) => p.id === pageId)
      const originalStoryText = originalPage?.story_text || ''
      const originalSceneDesc = originalPage?.scene_description || ''

      // If value matches original, remove from edits
      if (value === originalSceneDesc) {
        const newEdits = { ...prev }
        if (newEdits[pageId]) {
          delete newEdits[pageId].scene_description
          // If no edits left for this page, remove the page entirely
          if (!newEdits[pageId].story_text) {
            delete newEdits[pageId]
          } else {
            // Keep story_text if it exists
            newEdits[pageId] = {
              story_text: newEdits[pageId].story_text,
              scene_description: originalSceneDesc,
            }
          }
        }
        return Object.keys(newEdits[pageId] || {}).length > 0
          ? { ...newEdits }
          : Object.fromEntries(
            Object.entries(newEdits).filter(([id]) => id !== pageId)
          )
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

  const handleConfirmDiscard = () => {
    // Reset all edits
    setPageEdits({})
    setIsEditMode(false)
    setShowDiscardWarning(false)
  }

  const handleCancelDiscard = () => {
    setShowDiscardWarning(false)
  }

  const handleSave = async () => {
    if (!isDirty) return

    setIsSaving(true)

    try {
      const updates = Object.entries(pageEdits).map(([pageId, edits]) => ({
        id: pageId,
        story_text: edits.story_text,
        scene_description: edits.scene_description,
      }))

      const response = await fetch(`/api/projects/${projectId}/pages/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save changes')
      }

      const result = await response.json()

      // Clear edits
      setPageEdits({})
      setIsEditMode(false)

      // Show success toast
      toast.success('Changes saved!')

      // No reload needed - Realtime subscription in parent will update the UI
      // window.location.reload()
    } catch (error: any) {
      console.error('Error saving pages:', error)
      toast.error(error.message || 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscardWarning(true)
    } else {
      setIsEditMode(false)
    }
  }

  const handlePageClick = (pageId: string) => {
    const element = document.getElementById(`page-${pageId}`)
    if (element) {
      isManualScrollRef.current = true
      setActivePageId(pageId)
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Re-enable scroll spy after scroll animation completes
      setTimeout(() => {
        isManualScrollRef.current = false
      }, 1000)
    }
  }

  // Scroll spy: Highlight active page based on scroll position
  useEffect(() => {
    if (!pages || pages.length === 0) return

    const observerOptions = {
      root: null, // viewport
      rootMargin: '-100px 0px -50% 0px', // Trigger when page top is 100px from viewport top
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

      // Find the page with highest intersection ratio that's in the upper portion
      let bestPage: { id: string; ratio: number; top: number } | null = null

      pageVisibility.forEach((ratio, pageId) => {
        const element = document.getElementById(`page-${pageId}`)
        if (element) {
          const rect = element.getBoundingClientRect()
          // Prefer pages that are in the upper portion of viewport
          if (rect.top < window.innerHeight * 0.6) {
            if (!bestPage || ratio > bestPage.ratio || (ratio === bestPage.ratio && rect.top < bestPage.top)) {
              bestPage = { id: pageId, ratio, top: rect.top }
            }
          }
        }
      })

      // If no page in upper portion, use the one with highest visibility
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

      // Don't update if user manually clicked a page recently
      if (bestPage && !isManualScrollRef.current) {
        setActivePageId(bestPage.id)
      }
    }

    const observer = new IntersectionObserver(observerCallback, observerOptions)

    // Observe all page elements after DOM is ready
    const observePages = () => {
      pages.forEach((page) => {
        const element = document.getElementById(`page-${page.id}`)
        if (element) {
          observer.observe(element)
        }
      })
    }

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      observePages()
    })

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      pageVisibility.clear()
    }
  }, [pages])

  // Empty state
  if (!pages || pages.length === 0) {
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
      scene_description: edits.scene_description ?? page.scene_description,
    }
  }

  return (
    <>
      <div className="flex min-h-screen bg-gray-50 -m-8">
        {/* Sidebar - Desktop Only */}
        <ManuscriptSidebar
          pages={pages}
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
              onCancelClick={handleCancel}
              onSaveClick={handleSave}
              isSaving={isSaving}
              isDirty={isDirty}
            />

            {/* Page Cards */}
            {pages.map((page) => {
              const pageData = getPageData(page)
              return (
                <div key={page.id} id={`page-${page.id}`}>
                  <ManuscriptPage
                    page={pageData}
                    isEditMode={isEditMode}
                    originalStoryText={page.original_story_text}
                    originalSceneDescription={page.original_scene_description}
                    onStoryTextChange={handleStoryTextChange}
                    onSceneDescriptionChange={handleSceneDescriptionChange}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>


      {/* Discard Changes Warning Modal */}
      <AlertDialog open={showDiscardWarning} onOpenChange={setShowDiscardWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {Object.keys(pageEdits).length} unsaved change
              {Object.keys(pageEdits).length !== 1 ? 's' : ''}. Are you sure you want to
              discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDiscard}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


