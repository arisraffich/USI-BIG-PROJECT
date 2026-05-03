'use client'

import React, { ClipboardEvent } from 'react'

function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function handlePlainTextPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
  e.preventDefault()
  const text = e.clipboardData.getData('text/plain')
  const textarea = e.currentTarget
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const current = textarea.value
  textarea.value = current.slice(0, start) + text + current.slice(end)
  textarea.selectionStart = textarea.selectionEnd = start + text.length
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

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
  onStoryTextChange,
  onSceneDescriptionChange,
}: CustomerManuscriptPageProps) {
  const localStoryText = stripHtml(page.story_text || '')
  const localSceneDescription = stripHtml(page.scene_description || '')

  const handleStoryTextChange = (value: string) => {
    onStoryTextChange(page.id, value)
  }

  const handleSceneDescriptionChange = (value: string) => {
    onSceneDescriptionChange(page.id, value)
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm mb-8">
      <div className="px-8 pt-6 pb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Page {page.page_number}
        </p>
      </div>

      <div className="px-8 pb-6">
        {isEditMode ? (
          <textarea
            value={localStoryText}
            onChange={(e) => handleStoryTextChange(e.target.value)}
            onPaste={handlePlainTextPaste}
            placeholder="Type story text..."
            className="w-full min-h-[100px] bg-transparent outline-none resize-none font-serif text-xl leading-relaxed text-gray-900"
            style={{ whiteSpace: 'pre-wrap' }}
          />
        ) : (
          <div className="font-serif text-xl leading-relaxed text-gray-900" style={{ whiteSpace: 'pre-wrap' }}>
            {localStoryText || <p className="italic text-gray-400">[No story text]</p>}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100"></div>

      <div className="px-8 py-6 bg-slate-50">
        <div className="mb-3">
          <span className="text-xs font-medium text-gray-600">🎨 Scene Description</span>
        </div>
        {isEditMode ? (
          <textarea
            value={localSceneDescription}
            onChange={(e) => handleSceneDescriptionChange(e.target.value)}
            onPaste={handlePlainTextPaste}
            placeholder="Describe the scene for the illustrator..."
            className="w-full min-h-[60px] bg-transparent outline-none resize-none font-sans text-base text-gray-600"
            style={{ whiteSpace: 'pre-wrap' }}
          />
        ) : (
          <div className="font-sans text-base text-gray-600" style={{ whiteSpace: 'pre-wrap' }}>
            {localSceneDescription || <p className="text-gray-400">[No illustration instructions]</p>}
          </div>
        )}
      </div>
    </div>
  )
}
