'use client'

import { useState, useEffect } from 'react'
import TextareaAutosize from 'react-textarea-autosize'


interface Page {
  id: string
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
  is_customer_edited_story_text?: boolean
  is_customer_edited_scene_description?: boolean
}

interface ManuscriptPageProps {
  page: Page
  isEditMode: boolean
  originalStoryText?: string | null
  originalSceneDescription?: string | null
  onStoryTextChange: (pageId: string, value: string) => void
  onSceneDescriptionChange: (pageId: string, value: string) => void
}

export function ManuscriptPage({
  page,
  isEditMode,
  originalStoryText,
  originalSceneDescription,
  onStoryTextChange,
  onSceneDescriptionChange,
}: ManuscriptPageProps) {
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

  // No highlighting logic needed. Just simple text.

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm mb-8">
      {/* Header */}
      <div className="px-8 pt-6 pb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Page {page.page_number}
        </p>
      </div>

      {/* Block A: Story Text */}
      <div className="px-8 pb-6 min-h-[100px]">
        {isEditMode ? (
          <TextareaAutosize
            value={localStoryText}
            onChange={(e) => handleStoryTextChange(e.target.value)}
            placeholder="Type story text..."
            minRows={3}
            className="w-full font-serif text-xl leading-relaxed text-gray-900 placeholder:text-gray-300 border-0 focus:outline-none focus:ring-0 resize-none p-0"
            spellCheck={false}
          />
        ) : (
          <div className="font-serif text-xl leading-relaxed text-gray-900">
            {localStoryText.trim() ? (
              <p className="whitespace-pre-wrap">{localStoryText}</p>
            ) : (
              <p className="italic text-gray-400">[No story text]</p>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100"></div>

      {/* Block B: Illustration Instructions */}
      <div className="px-8 py-6 bg-slate-50">
        <div className="mb-3">
          <span className="text-xs font-medium text-gray-600">🎨 Illustration Notes</span>
        </div>
        {isEditMode ? (
          <TextareaAutosize
            value={localSceneDescription}
            onChange={(e) => handleSceneDescriptionChange(e.target.value)}
            placeholder="Describe the scene for the illustrator..."
            minRows={3}
            className="w-full font-sans text-base text-gray-600 placeholder:text-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none p-0"
            spellCheck={false}
          />
        ) : (
          <div className="font-sans text-base text-gray-600">
            {localSceneDescription.trim() ? (
              <p className="whitespace-pre-wrap">{localSceneDescription}</p>
            ) : (
              <p className="text-gray-400">[No illustration instructions]</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}








