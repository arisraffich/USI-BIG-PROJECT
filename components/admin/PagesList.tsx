'use client'

import { useState, useEffect, useCallback } from 'react'
import React from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { highlightTextDiffSimple } from '@/lib/utils/text-diff'
import { Page } from '@/types/page'

interface PagesListProps {
  projectId: string
  initialPages: Page[]
  projectStatus?: string
}

export function PagesList({ projectId, initialPages, projectStatus }: PagesListProps) {
  const [pages, setPages] = useState<Page[]>(initialPages)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasNewChanges, setHasNewChanges] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(() => {
    if (initialPages.length > 0) {
      // Get the latest updated_at from all pages
      const latest = initialPages.reduce((latest: string | null, page: any) => {
        if (!latest || (page.updated_at && page.updated_at > latest)) {
          return page.updated_at
        }
        return latest
      }, null)
      console.log('Admin: Initial lastUpdatedAt:', latest)
      return latest
    }
    return null
  })

  const fetchPages = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch(`/api/pages?project_id=${projectId}?_=${Date.now()}`)
      if (response.ok) {
        const data = await response.json()
        
        // Use functional state update to compare with current state (not stale closure)
        setPages((prevPages) => {
          if (data && data.length > 0) {
            // Get latest updated_at from fetched data
            const latestUpdate = data.reduce((latest: string | null, page: any) => {
              if (!latest || (page.updated_at && page.updated_at > latest)) {
                return page.updated_at
              }
              return latest
            }, null)
            
            // Get latest updated_at from previous state (not closure)
            const prevLatestUpdate = prevPages.length > 0
              ? prevPages.reduce((latest: string | null, page: any) => {
                  if (!latest || (page.updated_at && page.updated_at > latest)) {
                    return page.updated_at
                  }
                  return latest
                }, null)
              : null
            
            // If timestamp changed, there are new changes
            if (latestUpdate && prevLatestUpdate && latestUpdate !== prevLatestUpdate) {
              setHasNewChanges(true)
              setTimeout(() => setHasNewChanges(false), 3000)
            }
            if (latestUpdate) {
              setLastUpdatedAt(latestUpdate)
            }
          }
          
          // Always return latest data
          return data || []
        })
      }
    } catch (error) {
      console.error('Error fetching pages:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [projectId])

  // Always poll when project is in character_review status (customer can make changes)
  // Poll every 2 seconds to check for updates
  useEffect(() => {
    // Always do an initial fetch
    fetchPages()
    
    // Only poll if in character_review status
    if (projectStatus !== 'character_review') {
      return
    }
    
    const interval = setInterval(() => {
      fetchPages()
    }, 2000) // Check every 2 seconds for changes

    return () => {
      clearInterval(interval)
    }
  }, [projectStatus, fetchPages])

  if (!pages || pages.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-gray-500 py-8">
            No pages yet. Pages will appear here after story parsing.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPages}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          {hasNewChanges && (
            <span className="text-sm text-green-600 font-medium animate-pulse">
              ✨ New changes detected
            </span>
          )}
          {projectStatus === 'character_review' && (
            <span className="text-xs text-gray-500">
              Auto-refreshing when customer saves...
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pages.map((page) => {
          const originalStoryText = page.original_story_text || ''
          const currentStoryText = page.story_text || ''
          const originalSceneDesc = page.original_scene_description || null
          const currentSceneDesc = page.scene_description || null

          // Check if edited - use flag (most reliable indicator, persists after refresh)
          const isStoryEdited = !!page.is_customer_edited_story_text
          const isSceneEdited = !!page.is_customer_edited_scene_description

          // Highlight if edited - use diff if we have original, otherwise highlight all
          let highlightedStoryText: React.ReactNode = currentStoryText
          if (isStoryEdited) {
            // Always highlight if flag is set
            if (originalStoryText && originalStoryText !== '' && originalStoryText !== currentStoryText) {
              // Use diff highlighting if we have original text
              highlightedStoryText = highlightTextDiffSimple(originalStoryText, currentStoryText)
            } else {
              // Fallback: highlight entire text if edited but no original or texts match
              highlightedStoryText = <span className="text-red-600 font-semibold">{currentStoryText}</span>
            }
          }

          let highlightedSceneDesc: React.ReactNode = currentSceneDesc
          if (isSceneEdited) {
            // Always highlight if flag is set
            if (originalSceneDesc && originalSceneDesc !== '' && originalSceneDesc !== currentSceneDesc) {
              // Use diff highlighting if we have original text
              highlightedSceneDesc = highlightTextDiffSimple(originalSceneDesc, currentSceneDesc || '')
            } else {
              // Fallback: highlight entire text if edited but no original
              highlightedSceneDesc = <span className="text-red-600 font-semibold">{currentSceneDesc}</span>
            }
          }

          return (
            <Card key={page.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-lg">Page {page.page_number}</h3>
                  <Link href={`/admin/project/${projectId}/pages/${page.id}/edit`}>
                    <Button variant="outline" size="sm">Edit</Button>
                  </Link>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Story Text:
                    {isStoryEdited && (
                      <span className="ml-2 text-xs text-red-600 font-normal">(Customer edited)</span>
                    )}
                  </p>
                  <div className={`text-sm whitespace-pre-wrap ${isStoryEdited ? '' : 'text-gray-600'}`}>
                    {currentStoryText ? (
                      <div>
                        {highlightedStoryText}
                      </div>
                    ) : (
                      <p className="text-gray-400 italic">No story text</p>
                    )}
                  </div>
                </div>
                {currentSceneDesc && (
                  <div className="mb-2">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Scene Description:
                      {isSceneEdited && (
                        <span className="ml-2 text-xs text-red-600 font-normal">(Customer edited)</span>
                      )}
                    </p>
                    <div className={`text-xs whitespace-pre-wrap ${isSceneEdited ? '' : 'text-gray-600'}`}>
                      <p>{highlightedSceneDesc}</p>
                    </div>
                    {page.description_auto_generated && (
                      <span className="text-xs text-orange-600 mt-1 inline-block">Edited</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}










