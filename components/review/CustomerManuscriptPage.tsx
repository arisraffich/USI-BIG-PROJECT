'use client'

import React, { useState, useEffect } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { highlightTextDiffSimple } from '@/lib/utils/text-diff'

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

  // CRITICAL: Flag is the source of truth for persistence after refresh
  // If flag is set, we MUST highlight ONLY the differences
  // Highlight logic for Story Text
  // If customer edited -> RED. If not (Admin edit) -> BLUE.
  const flagIsSet = !!page.is_customer_edited_story_text
  const shouldHighlightStory = (flagIsSet || isEditMode) && originalStoryText !== undefined && originalStoryText !== null && originalStoryText !== localStoryText
  const storyHighlightColor = flagIsSet ? 'red' : 'blue'

  let highlightedStoryText: React.ReactNode = localStoryText
  if (shouldHighlightStory) {
    // Flag is set AND texts differ - use diff highlighting to show ONLY the added/changed parts
    highlightedStoryText = highlightTextDiffSimple(originalStoryText || '', localStoryText || '', storyHighlightColor)
  }

  // CRITICAL: Flag is the source of truth for persistence after refresh
  // If flag is set, we MUST highlight ONLY the differences
  const sceneFlagIsSet = !!page.is_customer_edited_scene_description

  // Highlight if flag is set AND texts differ (original_scene_description can be null/empty if customer added to empty field)
  const shouldHighlightScene = (sceneFlagIsSet || isEditMode) && originalSceneDescription !== undefined && originalSceneDescription !== localSceneDescription
  const sceneHighlightColor = sceneFlagIsSet ? 'red' : 'blue'

  let highlightedSceneDescription: React.ReactNode = localSceneDescription
  if (shouldHighlightScene) {
    // Flag is set AND texts differ - use diff highlighting to show ONLY the added/changed parts
    highlightedSceneDescription = highlightTextDiffSimple(originalSceneDescription || '', localSceneDescription || '', sceneHighlightColor)
  }

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
          <div className="relative w-full">
            {/* Backdrop Layer with Highlighting */}
            <div className="absolute inset-0 font-serif text-xl leading-relaxed whitespace-pre-wrap break-words pointer-events-none text-gray-900 p-0">
              {highlightedStoryText}
            </div>
            {/* Transparent Textarea for Input */}
            <TextareaAutosize
              value={localStoryText}
              onChange={(e) => handleStoryTextChange(e.target.value)}
              placeholder="Type story text..."
              minRows={3}
              className="relative z-10 w-full font-serif text-xl leading-relaxed text-transparent bg-transparent caret-gray-900 border-0 focus:outline-none focus:ring-0 resize-none p-0"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="font-serif text-xl leading-relaxed text-gray-900">
            {localStoryText.trim() ? (
              <p className="whitespace-pre-wrap">{highlightedStoryText}</p>
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
          <div className="relative w-full">
            {/* Backdrop Layer with Highlighting */}
            <div className="absolute inset-0 font-sans text-base text-gray-600 whitespace-pre-wrap break-words pointer-events-none p-0">
              {highlightedSceneDescription}
            </div>
            {/* Transparent Textarea for Input */}
            <TextareaAutosize
              value={localSceneDescription}
              onChange={(e) => handleSceneDescriptionChange(e.target.value)}
              placeholder="Describe the scene for the illustrator..."
              minRows={3}
              className="relative z-10 w-full font-sans text-base text-transparent bg-transparent caret-gray-600 border-0 focus:outline-none focus:ring-0 resize-none p-0"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="font-sans text-base text-gray-600">
            {localSceneDescription.trim() ? (
              <p className="whitespace-pre-wrap">{highlightedSceneDescription}</p>
            ) : (
              <p className="text-gray-400">[No illustration instructions]</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}






