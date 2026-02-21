'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

const MIN_PHOTO_DIMENSION = 300
const MAX_PHOTO_SIZE = 10 * 1024 * 1024
const MAX_UPLOAD_DIMENSION = 1200
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']

function validatePhotoFile(file: File): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
        if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
            resolve({ valid: false, error: 'Please upload a JPG, PNG, or HEIC image.' })
            return
        }
        if (file.size > MAX_PHOTO_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
            resolve({ valid: false, error: `File is too large (${sizeMB}MB). Please upload an image under 10MB.` })
            return
        }
        if (file.type === 'image/heic' || file.type === 'image/heif') {
            resolve({ valid: true })
            return
        }
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(url)
            const shortest = Math.min(img.width, img.height)
            if (shortest < MIN_PHOTO_DIMENSION) {
                resolve({ valid: false, error: `Photo resolution is too low (${img.width}×${img.height}). Please upload a higher quality image.` })
            } else {
                resolve({ valid: true })
            }
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve({ valid: false, error: 'Could not read this image. Please try a different file.' })
        }
        img.src = url
    })
}

function resizeImage(file: File, maxDim: number): Promise<Blob> {
    return new Promise((resolve) => {
        if (file.type === 'image/heic' || file.type === 'image/heif') {
            resolve(file)
            return
        }
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(url)
            if (img.width <= maxDim && img.height <= maxDim) {
                resolve(file)
                return
            }
            const scale = maxDim / Math.max(img.width, img.height)
            const w = Math.round(img.width * scale)
            const h = Math.round(img.height * scale)
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0, w, h)
            canvas.toBlob(
                (blob) => resolve(blob || file),
                file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                0.85
            )
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve(file)
        }
        img.src = url
    })
}

interface UseReferencePhotoOptions {
    characterId: string
    initialUrl: string | null | undefined
    onValidityChange?: (hasPhoto: boolean) => void
}

export function useReferencePhoto({ characterId, initialUrl, onValidityChange }: UseReferencePhotoOptions) {
    const [photoUrl, setPhotoUrl] = useState<string | null>(initialUrl || null)
    const [localPreview, setLocalPreview] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setPhotoUrl(initialUrl || null)
    }, [initialUrl])

    const displayUrl = localPreview || photoUrl

    const handleSelect = useCallback(async (file: File) => {
        const validation = await validatePhotoFile(file)
        if (!validation.valid) {
            toast.error(validation.error)
            return
        }

        // Optimistic preview
        const previewUrl = URL.createObjectURL(file)
        setLocalPreview(previewUrl)
        setUploading(true)
        onValidityChange?.(true)

        try {
            const resized = await resizeImage(file, MAX_UPLOAD_DIMENSION)
            const fd = new FormData()
            fd.append('file', resized, file.name)
            const response = await fetch(`/api/review/characters/${characterId}/reference-photo`, {
                method: 'POST',
                body: fd,
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Upload failed')
            }

            const { url } = await response.json()
            setPhotoUrl(url)
            toast.success('Photo uploaded — text fields are now optional')
        } catch (error: unknown) {
            // Revert optimistic state
            setLocalPreview(null)
            onValidityChange?.(false)
            const msg = error instanceof Error ? error.message : 'Upload failed'
            toast.error(msg)
        } finally {
            URL.revokeObjectURL(previewUrl)
            setLocalPreview(null)
            setUploading(false)
        }
    }, [characterId, onValidityChange])

    const handleRemove = useCallback(async () => {
        try {
            await fetch(`/api/review/characters/${characterId}/reference-photo`, { method: 'DELETE' })
            setPhotoUrl(null)
            setLocalPreview(null)
            onValidityChange?.(false)
            toast('Photo removed')
        } catch {
            toast.error('Failed to remove photo')
        }
    }, [characterId, onValidityChange])

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleSelect(file)
        if (inputRef.current) inputRef.current.value = ''
    }, [handleSelect])

    const openFilePicker = useCallback(() => {
        inputRef.current?.click()
    }, [])

    return {
        photoUrl: displayUrl,
        hasPhoto: !!(photoUrl || localPreview),
        uploading,
        inputRef,
        handleSelect,
        handleRemove,
        handleInputChange,
        openFilePicker,
    }
}
