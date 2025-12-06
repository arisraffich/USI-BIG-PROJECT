'use client'

import { useState, useRef, useEffect } from 'react'

interface RichTextEditorProps {
    initialContent: string
    onChange: (html: string) => void
    role: 'admin' | 'customer'
    readOnly?: boolean
    className?: string
    placeholder?: string
}

// Tailwind colors to Hex mapping
const ROLE_COLORS = {
    admin: '#2563eb', // blue-600
    customer: '#dc2626', // red-600
}

export function RichTextEditor({
    initialContent,
    onChange,
    role,
    readOnly = false,
    className = '',
    placeholder = '',
}: RichTextEditorProps) {
    const contentEditableRef = useRef<HTMLDivElement>(null)
    const isDesigningRef = useRef(false) // Track if we are currently handling an input event to prevent loops
    const roleColor = ROLE_COLORS[role]

    // Initialize content
    useEffect(() => {
        if (contentEditableRef.current && initialContent && contentEditableRef.current.innerHTML !== initialContent) {
            // Only set if significantly different to allow cursor persistence if re-rendering (though we try to avoid that)
            // For simple use cases, strictly creating from initialContent on mount is safest, 
            // but if parent updates, we might lose cursor. 
            // Strategy: Only set if empty or specifically requested. 
            // For now, let's just set it on mount or if provided content changes significantly 
            // (but this component is usually controlled by local state in parent?).

            // Actually, for this specific app, the parent "ManuscriptEditor" manages state. 
            // We generally receive "story_text" which might be updated by Realtime. 
            // We should be careful. 
            // Let's rely on the parent to pass the *current* value.

            // Check if content matches roughly to avoid cursor jumps
            if (contentEditableRef.current.innerHTML !== initialContent) {
                contentEditableRef.current.innerHTML = initialContent
            }
        }
    }, [initialContent])

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        if (contentEditableRef.current) {
            const html = contentEditableRef.current.innerHTML
            onChange(html)
        }
    }

    // Ensure content is "sanitized" or "prepared" for the role color
    const ensureColor = () => {
        if (readOnly) return

        // We use execCommand to set the color for the NEXT typed character.
        // This works by setting the document's internal "styleWithCSS" mechanism.
        document.execCommand('styleWithCSS', false, 'true')
        document.execCommand('foreColor', false, roleColor)
    }

    const handleFocus = () => {
        ensureColor()
    }

    const handleClick = () => {
        // Even if they click somewhere, we want to force their color for new typing
        // However, if they click inside their OWN color, it's fine.
        // If they click inside the OTHER role's color, we want to split it?
        // execCommand handles this reasonably well.
        ensureColor()
    }

    const handleKeyUp = () => {
        // Re-enforce color after creating new lines etc
        ensureColor()
    }

    return (
        <div
            ref={contentEditableRef}
            contentEditable={!readOnly}
            onInput={handleInput}
            onFocus={handleFocus}
            onClick={handleClick}
            onKeyUp={handleKeyUp}
            className={`min-h-[150px] w-full bg-transparent outline-none prose prose-sm max-w-none ${className}`}
            style={{
                whiteSpace: 'pre-wrap', // Preserve whitespace like a textarea
                overflowWrap: 'break-word',
            }}
            suppressContentEditableWarning={true}
            data-placeholder={placeholder}
        />
    )
}

// Simple sanitizer to be used before saving or displaying if needed
// (Included here for reference, but typically used in the parent or API)
export function sanitizeHTML(html: string): string {
    // Allow only spans with style color
    // Ideally use a library, but a basic replace/strip for script tags is minimum
    if (!html) return ''

    // 1. Remove script tags
    let clean = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, "")

    // 2. Remove iframe, object, embed
    clean = clean.replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gm, "")
    clean = clean.replace(/<object\b[^>]*>([\s\S]*?)<\/object>/gm, "")

    // 3. Keep it simple for now. 
    return clean
}
