'use client'

import React, { useState, useEffect } from 'react'
import { RichTextEditor } from '@/components/shared/RichTextEditor'

interface Page {
  id: string
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
  is_customer_edited_story_text?: boolean
  is_customer_edited_scene_description?: boolean
}

interface CustomerManuscriptPageProps {
  page: Page
  isEditMode: boolean
  originalStoryText: string
  originalSceneDescription: string | null
  onStoryTextChange: (pageId: string, value: string) => void
  onSceneDescriptionChange: (pageId: string, value: string) => void
}

export function CustomerManuscriptPage({
  page,
  isEditMode,
  originalStoryText,
  originalSceneDescription,
  onStoryTextChange,
  onSceneDescriptionChange,
}: CustomerManuscriptPageProps) {
  const [localStoryText, setLocalStoryText] = useState(page.story_text || '')
  const [localSceneDescription, setLocalSceneDescription] = useState(
    page.scene_description || ''
  )

  // Sync with prop changes (e.g., when canceling edits)
  useEffect(() => {
    setLocalStoryText(page.story_text || '')
    setLocalSceneDescription(page.scene_description || '')
  }, [page.story_text, page.scene_description])

  const handleStoryTextChange = (value: string) => {
    setLocalStoryText(value)
    onStoryTextChange(page.id, value)
  }

  const handleSceneDescriptionChange = (value: string) => {
    setLocalSceneDescription(value)
    onSceneDescriptionChange(page.id, value)
  }

  // Customer View - Always uses role="customer" for current user editing
  // Admin edits (Blue) will be preserved in the HTML. Customer types in Red.

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm mb-8">
      {/* Header */}
      <div className="px-8 pt-6 pb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Page {page.page_number}
        </p>
      </div>

      {/* Block A: Story Text */}
      <div className="px-8 pb-6">
        {isEditMode ? (
          <RichTextEditor
            initialContent={localStoryText}
            onChange={handleStoryTextChange}
            role="customer"
            placeholder="Type story text..."
            className="font-serif text-xl leading-relaxed text-gray-900"
          />
        ) : (
          <div className="font-serif text-xl leading-relaxed text-gray-900">
            {localStoryText.trim() ? (
              <RichTextEditor
                initialContent={localStoryText}
                onChange={() => { }}
                role="customer"
                readOnly={true}
                className="font-serif text-xl leading-relaxed text-gray-900"
              />
            ) : (
              <p className="italic text-gray-400">[No story text]</p>
            )}
          </div>
        )}
      </div>

      {/* Scene Description hidden from customer view */}
    </div>
  )
}








