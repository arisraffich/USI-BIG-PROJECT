'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Color, TextStyle, LineHeight } from '@tiptap/extension-text-style'
import { Button } from '@/components/ui/button'
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading2, Link as LinkIcon, Undo, Redo, ChevronDown,
  Save, Eye, EyeOff, Loader2, Check, Palette,
} from 'lucide-react'
import type { EmailTemplate } from '@/lib/email/types'

interface Props {
  template: EmailTemplate
  onSaved: () => void
}

const COLOR_PRESETS = [
  { label: 'Black', value: '#000000' },
  { label: 'Dark Gray', value: '#333333' },
  { label: 'Gray', value: '#666666' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Pink', value: '#db2777' },
]

function CustomColorInput({ initial, onApply }: { initial: string; onApply: (v: string) => void }) {
  const [hex, setHex] = useState(initial || '#333333')
  return (
    <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
      <input type="color" value={hex}
        onChange={e => { setHex(e.target.value); onApply(e.target.value) }}
        className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0"
      />
      <input type="text" placeholder="#hex" value={hex}
        onChange={e => setHex(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const v = hex.trim()
            if (/^#[0-9a-fA-F]{3,6}$/.test(v)) onApply(v)
          }
        }}
        className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded font-mono w-20"
      />
    </div>
  )
}

const LINE_HEIGHT_OPTIONS = ['1', '1.15', '1.3', '1.5', '1.6', '1.8', '2']

function LineHeightPicker({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!editor) return null
  const current = editor.getAttributes('textStyle').lineHeight

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-gray-200 text-xs font-medium ${open ? 'bg-gray-200' : ''}`}
        title="Line Height">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[100px]">
          {LINE_HEIGHT_OPTIONS.map(lh => (
            <button key={lh} type="button"
              onClick={() => { editor.chain().focus().setLineHeight(lh).run(); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${current === lh ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>
              {lh}x
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button type="button"
              onClick={() => { editor.chain().focus().unsetLineHeight().run(); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50">
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ColorPicker({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!editor) return null
  const activeColor = editor.getAttributes('textStyle').color

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`p-1.5 rounded hover:bg-gray-200 ${activeColor ? 'bg-gray-200' : ''}`} title="Text Color">
        <Palette className="w-4 h-4" style={{ color: activeColor || '#333' }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 w-[170px]">
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {COLOR_PRESETS.map(c => (
              <button key={c.value} type="button" title={c.label}
                onClick={() => { editor.chain().focus().setColor(c.value).run(); setOpen(false) }}
                className="w-7 h-7 rounded-md border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c.value }}
              />
            ))}
            <button type="button" title="Reset"
              onClick={() => { editor.chain().focus().unsetColor().run(); setOpen(false) }}
              className="w-7 h-7 rounded-md border border-gray-300 hover:scale-110 transition-transform flex items-center justify-center text-xs text-gray-400 bg-white">
              ✕
            </button>
          </div>
          <CustomColorInput
            key={open ? 'open' : 'closed'}
            initial={activeColor || '#333333'}
            onApply={val => editor.chain().focus().setColor(val).run()}
          />
        </div>
      )}
    </div>
  )
}

function MenuBar({ editor, variables }: {
  editor: ReturnType<typeof useEditor> | null
  variables: string[]
}) {
  const [showVarMenu, setShowVarMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowVarMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!editor) return null

  const insertVariable = (varName: string) => {
    editor.chain().focus().insertContent(`{{${varName}}}`).run()
    setShowVarMenu(false)
  }

  const setLink = () => {
    const url = window.prompt('URL:')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-2 bg-gray-50 rounded-t-lg">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}>
        <Bold className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}>
        <Italic className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}>
        <UnderlineIcon className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : ''}`}>
        <Heading2 className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('bulletList') ? 'bg-gray-200' : ''}`}>
        <List className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('orderedList') ? 'bg-gray-200' : ''}`}>
        <ListOrdered className="w-4 h-4" />
      </button>
      <button type="button" onClick={setLink}
        className={`p-1.5 rounded hover:bg-gray-200 ${editor.isActive('link') ? 'bg-gray-200' : ''}`}>
        <LinkIcon className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <ColorPicker editor={editor} />
      <LineHeightPicker editor={editor} />

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().undo().run()}
        className="p-1.5 rounded hover:bg-gray-200" disabled={!editor.can().undo()}>
        <Undo className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()}
        className="p-1.5 rounded hover:bg-gray-200" disabled={!editor.can().redo()}>
        <Redo className="w-4 h-4" />
      </button>

      {variables.length > 0 && (
        <>
          <div className="w-px h-5 bg-gray-300 mx-1" />
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setShowVarMenu(!showVarMenu)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
              Insert Variable <ChevronDown className="w-3 h-3" />
            </button>
            {showVarMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] py-1">
                {variables.map(v => (
                  <button key={v} type="button" onClick={() => insertVariable(v)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 font-mono">
                    {'{{' + v + '}}'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TipTapEditor({ content, onChange, variables, label }: {
  content: string
  onChange: (html: string) => void
  variables: string[]
  label: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2] } }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      LineHeight,
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'tiptap-content focus:outline-none min-h-[120px] p-3',
      },
    },
  })

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <MenuBar editor={editor} variables={variables} />
        <style>{`
          .tiptap-content { font-size: 14px; line-height: 1.6; color: #333; }
          .tiptap-content h2 { font-size: 18px; font-weight: 700; margin: 0 0 12px; }
          .tiptap-content p { margin: 0 0 12px; }
          .tiptap-content ol { list-style-type: decimal; padding-left: 24px; margin: 0 0 12px; }
          .tiptap-content ul { list-style-type: disc; padding-left: 24px; margin: 0 0 12px; }
          .tiptap-content li { margin-bottom: 4px; }
          .tiptap-content li p { margin: 0; }
          .tiptap-content a { color: #2563eb; text-decoration: underline; }
        `}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

export function EmailTemplateEditor({ template, onSaved }: Props) {
  const [subject, setSubject] = useState(template.subject)
  const [bodyHtml, setBodyHtml] = useState(template.body_html)
  const [closingHtml, setClosingHtml] = useState(template.closing_html || '')
  const [buttonText, setButtonText] = useState(template.button_text || '')
  const [buttonColor, setButtonColor] = useState(template.button_color || '#2563eb')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/email-templates/${template.slug}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body_html: bodyHtml,
          closing_html: closingHtml || null,
          button_text: buttonText || null,
          button_color: buttonColor,
        }),
      })
      if (res.ok) {
        const html = await res.text()
        setPreviewHtml(html)
        setShowPreview(true)
      }
    } catch {
      // ignore preview errors
    }
  }, [template.slug, subject, bodyHtml, closingHtml, buttonText, buttonColor])

  const handleSave = useCallback(async () => {
    setShowConfirm(false)
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/admin/email-templates/${template.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body_html: bodyHtml,
          closing_html: closingHtml || null,
          button_text: buttonText || null,
          button_color: buttonColor,
          has_button: template.has_button,
        }),
      })
      if (res.ok) {
        setSaved(true)
        onSaved()
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }, [template.slug, template.has_button, subject, bodyHtml, closingHtml, buttonText, buttonColor, onSaved])

  const variables = template.available_variables || []
  const buttonUrlVar = template.button_url_variable

  return (
    <div className="space-y-5">
      {/* Description */}
      {template.description && (
        <p className="text-sm text-gray-500">{template.description}</p>
      )}

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Subject Line
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {variables.length > 0 && (
            <SubjectVariableDropdown variables={variables} onInsert={(v) => setSubject(prev => prev + `{{${v}}}`)} />
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Available: {variables.map(v => `{{${v}}}`).join(', ')}
        </p>
      </div>

      {/* Body Editor */}
      <TipTapEditor
        content={bodyHtml}
        onChange={setBodyHtml}
        variables={variables}
        label="Email Body"
      />

      {/* Button Config */}
      {template.has_button && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">
            CTA Button
            {buttonUrlVar && <span className="text-gray-400 font-normal"> — links to {'{{' + buttonUrlVar + '}}'}</span>}
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Button Text</label>
              <input
                type="text"
                value={buttonText}
                onChange={e => setButtonText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs text-gray-500 mb-1">Button Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={buttonColor}
                  onChange={e => setButtonColor(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={buttonColor}
                  onChange={e => setButtonColor(e.target.value)}
                  className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
          </div>
          {/* Button preview */}
          <div className="pt-2">
            <span
              className="inline-block px-4 py-2 text-white text-sm font-bold rounded-md"
              style={{ backgroundColor: buttonColor }}
            >
              {buttonText || 'Button'}
            </span>
          </div>
        </div>
      )}

      {/* Closing Editor */}
      {(template.closing_html !== null || closingHtml) && (
        <TipTapEditor
          content={closingHtml}
          onChange={setClosingHtml}
          variables={variables}
          label="Closing Text (after button)"
        />
      )}

      {/* Preview */}
      {showPreview && previewHtml && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b">
            <span className="text-sm font-medium text-gray-700">Email Preview</span>
            <button type="button" onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white p-4">
            <div className="mb-3 pb-3 border-b border-gray-100">
              <p className="text-xs text-gray-400">Subject</p>
              <p className="text-sm font-medium">{subject.replace(/\{\{(\w+)\}\}/g, (_, k) => sampleVal(k))}</p>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="w-full border-0"
              style={{ minHeight: 300 }}
              title="Email preview"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={loadPreview}>
          <Eye className="w-4 h-4 mr-2" />
          Preview
        </Button>

        <Button onClick={() => setShowConfirm(true)} disabled={saving}>
          {saving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
          ) : saved ? (
            <><Check className="w-4 h-4 mr-2" /> Saved</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Changes</>
          )}
        </Button>

        {saved && <span className="text-sm text-green-600">Template saved successfully</span>}
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Save Template Changes?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will update the <strong>{template.name}</strong> email template. Future emails will use the new content.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button onClick={handleSave}>Confirm Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SubjectVariableDropdown({ variables, onInsert }: { variables: string[], onInsert: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="h-[38px]">
        <ChevronDown className="w-3 h-3" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
          {variables.map(v => (
            <button key={v} type="button"
              onClick={() => { onInsert(v); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 font-mono">
              {'{{' + v + '}}'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function sampleVal(key: string): string {
  const samples: Record<string, string> = {
    authorFirstName: 'Sarah',
    authorName: 'Sarah Johnson',
    revisionRound: '2',
    roundText: ' | Round 2',
    secondaryCharacterCount: '3',
    status: 'character_generation',
    customerName: 'Sarah Johnson',
    bookTitle: 'The Magic Garden',
  }
  return samples[key] || key
}
