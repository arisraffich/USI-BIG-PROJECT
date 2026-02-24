import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Loader2, RefreshCw, MessageSquare, CheckCircle2, Info, Download, Upload, X, AlertTriangle, Trash2, Camera, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { createClient } from '@/lib/supabase/client'
import { getErrorMessage } from '@/lib/utils/error'
import { mapErrorToUserMessage, MappedError } from '@/lib/utils/generation-errors'

interface UnifiedCharacterCardProps {
    character: Character
    projectId: string
    isGenerating?: boolean
    isSketchPhase?: boolean
}

interface SubCardProps {
    title: string
    imageUrl: string | null | undefined
    isLoading: boolean
    onClick: () => void
    characterName: string
    onDownload?: (e: React.MouseEvent) => void
    onUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void
    onRetry?: () => void
    onFileDrop?: (file: File) => void
    showUpload?: boolean
    showDownload?: boolean
}

function SubCard({ title, imageUrl, isLoading, onClick, characterName, onDownload, onUpload, onRetry, onFileDrop, showUpload = false, showDownload = true }: SubCardProps) {
    const [isDragOver, setIsDragOver] = useState(false)

    const isError = imageUrl?.startsWith('error:') ?? false
    const errorMessage = isError && imageUrl ? imageUrl.replace('error:', '') : null
    const actualImageUrl = isError ? null : imageUrl

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!onFileDrop) return
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }, [onFileDrop])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
        if (!onFileDrop) return

        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
        if (file) {
            onFileDrop(file)
        } else {
            toast.error('Please drop an image file')
        }
    }, [onFileDrop])

    return (
        <div className="relative w-full">
            <div 
                className={`relative aspect-[9/16] rounded-lg cursor-pointer hover:opacity-95 transition-all overflow-hidden ${isError ? 'bg-red-50 border-2 border-red-200' : isDragOver ? 'bg-blue-50 border-2 border-dashed border-blue-400' : 'bg-gray-100'}`}
                onClick={actualImageUrl ? onClick : undefined}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDragOver && (
                    <div className="absolute inset-0 bg-blue-100/70 backdrop-blur-sm flex flex-col items-center justify-center z-30 rounded-lg">
                        <Upload className="w-8 h-8 text-blue-500 mb-2" />
                        <span className="text-sm font-medium text-blue-700">Drop image here</span>
                    </div>
                )}

                {isError ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-600 p-3">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <span className="text-xs font-medium text-center">Generation Failed</span>
                        <span className="text-[10px] text-red-400 text-center mt-1 line-clamp-3">{errorMessage}</span>
                        <div className="flex items-center gap-2 mt-2">
                            {onRetry && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRetry() }}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Retry
                                </button>
                            )}
                            {showUpload && onUpload && (
                                <label
                                    className="px-3 py-1 bg-orange-500 text-white text-xs rounded-md hover:bg-orange-600 transition-colors flex items-center gap-1 cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Upload className="w-3 h-3" />
                                    Upload
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={onUpload}
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                ) : actualImageUrl ? (
                    <>
                        <img 
                            src={actualImageUrl} 
                            alt={`${characterName} - ${title}`} 
                            className="w-full h-full object-cover"
                        />
                        
                        {(showUpload || showDownload) && (
                            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                                {showDownload && onDownload && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDownload(e) }}
                                        className="block cursor-pointer"
                                        title="Download"
                                    >
                                        <Download className="w-5 h-5 text-gray-700 drop-shadow-lg" />
                                    </button>
                                )}
                                {showUpload && onUpload && (
                                    <label 
                                        className="block cursor-pointer"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Upload"
                                    >
                                        <Upload className="w-5 h-5 text-orange-600 drop-shadow-lg" />
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={onUpload}
                                        />
                                    </label>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <span className="text-sm">{onFileDrop ? 'Drop, paste, or upload' : 'No Image'}</span>
                    </div>
                )}

                {isLoading && !isError && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-lg z-20">
                        <div className="flex flex-col items-center gap-3 bg-white p-4 rounded-lg shadow-lg border border-blue-200">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
                                <div className="relative">
                                    <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                                </div>
                            </div>
                            <span className="text-sm font-medium text-gray-700">
                                Generating...
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export function UnifiedCharacterCard({ character, projectId, isGenerating = false, isSketchPhase = false }: UnifiedCharacterCardProps) {
    const router = useRouter()
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [customPrompt, setCustomPrompt] = useState(character.generation_prompt || '')
    const [showLightbox, setShowLightbox] = useState(false)
    const [lightboxImage, setLightboxImage] = useState<'sketch' | 'colored' | null>(null)
    const [showTooltip, setShowTooltip] = useState(false)
    const [showRefPhoto, setShowRefPhoto] = useState(false)
    const [optimisticColoredImage, setOptimisticColoredImage] = useState<string | null>(null)
    const [localCharacter, setLocalCharacter] = useState(character)
    const [isSketchGenerating, setIsSketchGenerating] = useState(false)
    const [referenceImage, setReferenceImage] = useState<{ file: File; preview: string } | null>(null)
    const referenceInputRef = useRef<HTMLInputElement>(null)
    const [comparisonState, setComparisonState] = useState<{ oldUrl: string; newUrl: string } | null>(null)
    const [comparisonLightboxUrl, setComparisonLightboxUrl] = useState<string | null>(null)
    const [generationError, setGenerationError] = useState<MappedError | null>(null)
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

    // Update local character when prop changes
    useEffect(() => {
        setLocalCharacter(character)
    }, [character])

    // Realtime subscription for sketch updates
    useEffect(() => {
        const supabase = createClient()
        const channel = supabase
            .channel(`character-sketch-${character.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'characters',
                    filter: `id=eq.${character.id}`
                },
                (payload) => {
                    if (payload.new) {
                        setLocalCharacter(payload.new as Character)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [character.id])

    const handleOpenRegenerate = () => {
        // Pre-populate with customer feedback if unresolved, otherwise empty
        const prompt = (character.feedback_notes && !character.is_resolved) 
            ? character.feedback_notes 
            : ''
        setCustomPrompt(prompt)
        setReferenceImage(null) // Reset reference image when opening
        setIsDialogOpen(true)
    }

    const addReferenceFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error(`"${file.name}" is too large (max 10MB).`)
            return
        }
        if (referenceImage) {
            URL.revokeObjectURL(referenceImage.preview)
        }
        setReferenceImage({ file, preview: URL.createObjectURL(file) })
    }, [referenceImage])

    const handleReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        addReferenceFile(file)
        if (referenceInputRef.current) {
            referenceInputRef.current.value = ''
        }
    }

    const handleRefDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const file = e.dataTransfer.files?.[0]
        if (file) addReferenceFile(file)
    }, [addReferenceFile])

    const handleRefDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const removeReferenceImage = () => {
        if (referenceImage?.preview) {
            URL.revokeObjectURL(referenceImage.preview)
        }
        setReferenceImage(null)
    }

    const handleRegenerate = async () => {
        setIsDialogOpen(false)
        setIsRegenerating(true)
        setGenerationError(null)
        try {
            let visualReferenceImage: string | undefined
            if (referenceImage?.file) {
                visualReferenceImage = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = reject
                    reader.readAsDataURL(referenceImage.file)
                })
            }

            const hasExistingImage = !!character.image_url && !character.image_url.startsWith('error:')

            const response = await fetch('/api/characters/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    character_id: character.id,
                    custom_prompt: customPrompt.trim() || undefined,
                    visual_reference_image: visualReferenceImage,
                    skipDbUpdate: hasExistingImage,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to regenerate character')
            }

            const result = data.results?.find((r: any) => r.character_id === character.id)
            if (data.failed > 0 || (result && !result.success)) {
                throw new Error(result?.error || 'Generation failed on server')
            }

            // Preload new image
            if (result?.image_url) {
                await new Promise((resolve) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = resolve
                    img.src = result.image_url
                })
            }

            if (result?.isPreview && result?.image_url && hasExistingImage) {
                setComparisonState({
                    oldUrl: character.image_url!,
                    newUrl: result.image_url,
                })
                toast.success('Compare and choose', { description: 'Select which version to keep' })
            } else if (result?.image_url) {
                setOptimisticColoredImage(result.image_url)
                toast.success('Character regenerated successfully')
            }

            removeReferenceImage()
        } catch (error: unknown) {
            console.error('Regeneration error:', error)
            const errorMessage = getErrorMessage(error, 'Failed to regenerate')
            const mapped = mapErrorToUserMessage(errorMessage)
            setGenerationError(mapped)
            toast.error('Regeneration failed', { description: mapped.message })
        } finally {
            setIsRegenerating(false)
        }
    }

    const handleComparisonDecision = async (decision: 'keep_new' | 'revert_old') => {
        if (!comparisonState) return
        const { oldUrl, newUrl } = comparisonState

        setComparisonState(null)

        if (decision === 'keep_new') {
            setIsSketchGenerating(true)
            setOptimisticColoredImage(newUrl)
            setLocalCharacter(prev => ({ ...prev, sketch_url: null }))
        }

        try {
            const response = await fetch('/api/characters/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, characterId: character.id, projectId, oldUrl, newUrl }),
            })

            if (!response.ok) throw new Error('Failed to confirm')

            if (decision === 'keep_new') {
                toast.success('New image confirmed', { description: 'Generating sketch...' })

                try {
                    const sketchRes = await fetch('/api/characters/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ characterId: character.id, imageUrl: newUrl }),
                    })
                    if (sketchRes.ok) {
                        const sketchData = await sketchRes.json()
                        if (sketchData.sketchUrl) {
                            setLocalCharacter(prev => ({ ...prev, sketch_url: sketchData.sketchUrl }))
                        }
                        toast.success('Sketch updated')
                    } else {
                        toast.error('Sketch update failed')
                    }
                } catch {
                    toast.error('Sketch update failed')
                }
            } else {
                toast.success('Reverted to previous image')
            }

            router.refresh()
        } catch (error: unknown) {
            console.error('Confirm error:', error)
            toast.error(getErrorMessage(error, 'Failed to confirm decision'))
        } finally {
            setIsSketchGenerating(false)
        }
    }

    const handleOpenLightbox = (type: 'sketch' | 'colored') => {
        setLightboxImage(type)
        setShowLightbox(true)
    }

    const handleDownload = async (type: 'sketch' | 'colored', e: React.MouseEvent) => {
        e.stopPropagation()
        const imageUrl = type === 'sketch' ? displaySketchImageUrl : displayColoredImageUrl
        if (!imageUrl) {
            toast.error('No image to download')
            return
        }

        try {
            const response = await fetch(imageUrl)
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            const filename = `${character.name || character.role || 'Character'}-${type}.png`
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            toast.success(`${type === 'sketch' ? 'Sketch' : 'Colored image'} downloaded`)
        } catch (error) {
            console.error('Download failed:', error)
            toast.error('Failed to download image')
        }
    }

    const uploadColoredFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }

        const formData = new FormData()
        formData.append('file', file)
        formData.append('character_id', character.id)
        formData.append('project_id', projectId)

        setIsRegenerating(true)
        try {
            const response = await fetch('/api/characters/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Upload failed')
            }

            const data = await response.json()
            toast.success('Colored image uploaded successfully')
            
            if (data.imageUrl) {
                await new Promise((resolve) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = resolve
                    img.src = data.imageUrl
                })
                setOptimisticColoredImage(data.imageUrl)
                setLocalCharacter(prev => ({ ...prev, sketch_url: null }))
            }

            setIsRegenerating(false)

            if (data.imageUrl) {
                setIsSketchGenerating(true)
                try {
                    const sketchRes = await fetch('/api/characters/generate-sketch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            characterId: character.id,
                            imageUrl: data.imageUrl,
                        }),
                    })
                    if (sketchRes.ok) {
                        const sketchData = await sketchRes.json()
                        if (sketchData.sketchUrl) {
                            setLocalCharacter(prev => ({ ...prev, sketch_url: sketchData.sketchUrl }))
                        }
                    } else {
                        const errorData = await sketchRes.json().catch(() => null)
                        const errorMsg = errorData?.error || `HTTP ${sketchRes.status}`
                        console.error('Sketch generation failed:', sketchRes.status, errorData)
                        setLocalCharacter(prev => ({ ...prev, sketch_url: `error:${errorMsg}` }))
                    }
                } catch (sketchErr) {
                    const errMsg = sketchErr instanceof Error ? sketchErr.message : 'Network error'
                    console.error('Sketch generation error:', sketchErr)
                    setLocalCharacter(prev => ({ ...prev, sketch_url: `error:${errMsg}` }))
                } finally {
                    setIsSketchGenerating(false)
                }
            }
        } catch (error: unknown) {
            console.error('Upload error:', error)
            toast.error(getErrorMessage(error, 'Failed to upload colored image'))
        } finally {
            setIsRegenerating(false)
        }
    }, [character.id, projectId])

    const handleUploadColored = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        await uploadColoredFile(file)
        e.target.value = ''
    }

    const handleUploadSketch = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append('file', file)
        formData.append('character_id', character.id)
        formData.append('project_id', projectId)

        setIsRegenerating(true)
        try {
            const response = await fetch('/api/characters/upload-sketch', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Upload failed')
            }

            const data = await response.json()
            toast.success('Sketch uploaded successfully')
            
            // Preload the new sketch
            if (data.sketchUrl) {
                await new Promise((resolve) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = resolve
                    img.src = data.sketchUrl
                })
                // Update local character with new sketch
                setLocalCharacter({
                    ...localCharacter,
                    sketch_url: data.sketchUrl
                })
            }
        } catch (error: unknown) {
            console.error('Upload error:', error)
            toast.error(getErrorMessage(error, 'Failed to upload sketch'))
        } finally {
            setIsRegenerating(false)
            // Reset file input
            e.target.value = ''
        }
    }

    const handleRetrySketch = async () => {
        const coloredUrl = optimisticColoredImage || localCharacter.image_url
        if (!coloredUrl) {
            toast.error('No colored image to generate sketch from')
            return
        }
        
        // Show spinner via explicit flag
        setIsSketchGenerating(true)
        setLocalCharacter(prev => ({ ...prev, sketch_url: null }))
        
        try {
            const sketchRes = await fetch('/api/characters/generate-sketch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: character.id,
                    imageUrl: coloredUrl,
                }),
            })
            if (sketchRes.ok) {
                const sketchData = await sketchRes.json()
                if (sketchData.sketchUrl) {
                    setLocalCharacter(prev => ({ ...prev, sketch_url: sketchData.sketchUrl }))
                    toast.success('Sketch generated successfully')
                }
            } else {
                const errorData = await sketchRes.json().catch(() => null)
                const errorMsg = errorData?.error || `HTTP ${sketchRes.status}`
                console.error('Sketch retry failed:', sketchRes.status, errorData)
                setLocalCharacter(prev => ({ ...prev, sketch_url: `error:${errorMsg}` }))
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Network error'
            console.error('Sketch retry error:', err)
            setLocalCharacter(prev => ({ ...prev, sketch_url: `error:${errMsg}` }))
        } finally {
            setIsSketchGenerating(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const response = await fetch(`/api/characters/${character.id}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to delete character')
            }

            toast.success(`${character.name || character.role || 'Character'} deleted`)
            router.refresh()
        } catch (error: unknown) {
            console.error('Delete error:', error)
            toast.error(getErrorMessage(error, 'Failed to delete character'))
        } finally {
            setIsDeleting(false)
        }
    }

    // Clipboard paste: add pasted image as visual reference (only when regenerate dialog is open)
    useEffect(() => {
        if (!isDialogOpen) return

        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items
            if (!items) return

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile()
                    if (file) {
                        e.preventDefault()
                        addReferenceFile(file)
                        toast.success('Image pasted as reference')
                        return
                    }
                }
            }
        }

        document.addEventListener('paste', handlePaste)
        return () => document.removeEventListener('paste', handlePaste)
    }, [isDialogOpen, addReferenceFile])

    const displayName = character.is_main
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

    const displayColoredImageUrl = optimisticColoredImage || localCharacter.image_url
    const displaySketchImageUrl = localCharacter.sketch_url
    const sketchHasError = !!(displaySketchImageUrl && displaySketchImageUrl.startsWith('error:'))
    const sketchIsReady = !!(displaySketchImageUrl && !sketchHasError)

    // Show loading on colored if regenerating OR if project generating and no image
    const showColoredLoading = !!(isRegenerating || (isGenerating && !displayColoredImageUrl))
    
    // Show loading on sketch when:
    // 1. We explicitly started sketch generation (isSketchGenerating), OR
    // 2. Parent says project is generating AND colored exists but sketch isn't ready yet, OR
    // 3. Sketch phase AND colored exists but sketch isn't ready yet, OR
    // 4. Colored image exists but sketch hasn't arrived yet (e.g., after new character generation)
    const showSketchLoading = !!(isSketchGenerating || (isGenerating && displayColoredImageUrl && !sketchIsReady && !sketchHasError) || (isSketchPhase && displayColoredImageUrl && !sketchIsReady && !sketchHasError) || (displayColoredImageUrl && !sketchIsReady && !sketchHasError))

    const lightboxImageUrl = comparisonLightboxUrl || (lightboxImage === 'sketch' ? displaySketchImageUrl : displayColoredImageUrl)

    return (
        <div
            className="flex flex-col w-full gap-4"
        >
            <Card className="flex flex-col w-full p-0 gap-0 border-0 shadow-[0_0_15px_rgba(0,0,0,0.12)]">
                <CardContent className="flex-1 flex flex-col p-4 bg-white rounded-t-lg">
                    <div className="flex justify-between items-center gap-2 relative">
                        <div className="flex items-center gap-2">
                            {character.story_role && (
                                <div
                                    className="relative flex-shrink-0"
                                    onMouseEnter={() => setShowTooltip(true)}
                                    onMouseLeave={() => setShowTooltip(false)}
                                >
                                    <Info className="w-5 h-5 fill-slate-900 text-white hover:fill-slate-700 cursor-help transition-colors" />
                                    {showTooltip && (
                                        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-md shadow-xl z-50 text-left">
                                            <div className="absolute bottom-[-4px] left-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                                            <p className="font-bold mb-1 text-sm">{character.is_main ? `${character.name || character.role || 'Character'} | Main Character` : displayName}</p>
                                            <p className="leading-relaxed whitespace-pre-wrap select-text">{character.story_role}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <h3 className="font-bold text-lg text-gray-900 leading-tight">
                                {displayName.length > 14 ? `${displayName.slice(0, 14)}...` : displayName}
                            </h3>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            {character.reference_photo_url && (
                                <Dialog open={showRefPhoto} onOpenChange={setShowRefPhoto}>
                                    <DialogTrigger asChild>
                                        <button
                                            className="transition-opacity hover:opacity-80"
                                            title="Customer reference photo"
                                        >
                                            <Camera className="w-[18px] h-[18px] text-indigo-600" />
                                        </button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[400px]">
                                        <DialogHeader>
                                            <DialogTitle>Customer Reference Photo — {displayName}</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex justify-center py-4">
                                            <img
                                                src={character.reference_photo_url}
                                                alt={`Reference photo for ${displayName}`}
                                                className="max-h-[60vh] rounded-lg object-contain"
                                            />
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}

                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <div
                                        className="cursor-pointer bg-violet-600 text-white w-[25px] h-[25px] rounded-md hover:bg-violet-700 hover:scale-105 transition-all shadow-sm flex items-center justify-center"
                                        onClick={handleOpenRegenerate}
                                        title="Regenerate"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </div>
                                </DialogTrigger>
                                    <DialogContent className="sm:max-w-[500px]">
                                        <DialogHeader>
                                            <DialogTitle>Regenerate {displayName}</DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">Generation Prompt</Label>
                                                <Textarea
                                                    value={customPrompt}
                                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                                    placeholder="Enter a custom prompt..."
                                                    className="min-h-[150px]"
                                                />
                                                <p className="text-xs text-gray-500">
                                                    Includes customer feedback if available.
                                                </p>
                                            </div>

                                            {/* Visual Reference Image Upload */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-sm font-medium">Visual Reference (Optional)</Label>
                                                    <span className="text-xs text-gray-400">Max 10MB</span>
                                                </div>

                                                <input
                                                    type="file"
                                                    ref={referenceInputRef}
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={handleReferenceSelect}
                                                />

                                                {referenceImage ? (
                                                    <div className="relative w-20 h-20 rounded-md overflow-hidden border border-gray-200 group">
                                                        <img 
                                                            src={referenceImage.preview} 
                                                            alt="Reference" 
                                                            className="w-full h-full object-cover" 
                                                        />
                                                        <button
                                                            onClick={removeReferenceImage}
                                                            className="absolute top-0.5 right-0.5 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : null}

                                                <div
                                                    onDragOver={handleRefDragOver}
                                                    onDrop={handleRefDrop}
                                                    onClick={() => referenceInputRef.current?.click()}
                                                    className="w-full border-2 border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center gap-1 h-16 text-slate-500 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-50 cursor-pointer transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 text-sm font-medium">
                                                        <Upload className="w-4 h-4" />
                                                        Drop, paste, or click to add
                                                    </div>
                                                </div>

                                                <p className="text-xs text-gray-500">
                                                    Upload an image to guide the character's appearance (e.g., a real hawk photo).
                                                </p>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => { setIsDialogOpen(false); removeReferenceImage(); }}>Cancel</Button>
                                            <Button onClick={handleRegenerate} disabled={isRegenerating}>
                                                {isRegenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                Regenerate
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                            </Dialog>

                            {!character.is_main && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <button
                                            className="transition-opacity hover:opacity-80"
                                            title="Delete character"
                                            disabled={isDeleting}
                                        >
                                            {isDeleting
                                                ? <Loader2 className="w-[18px] h-[18px] text-red-500 animate-spin" />
                                                : <Trash2 className="w-[18px] h-[18px] text-red-500" />
                                            }
                                        </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete {displayName}?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently remove this character and unlink it from all pages. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleDelete}
                                                className="bg-red-600 hover:bg-red-700"
                                            >
                                                Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </div>
                </CardContent>

                {/* COMPARISON MODE: OLD vs NEW side by side */}
                {comparisonState ? (
                    <div className="grid grid-cols-2 gap-3 p-4">
                        {/* OLD (Left) */}
                        <div className="relative rounded-lg overflow-hidden border border-slate-200">
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-2 bg-gradient-to-b from-black/60 to-transparent">
                                <span className="text-xs font-bold tracking-wider text-white uppercase px-2 py-0.5 bg-slate-700/80 rounded">OLD</span>
                            </div>
                            <div className="aspect-[9/16] bg-gray-100 cursor-pointer" onClick={() => { setComparisonLightboxUrl(comparisonState.oldUrl); setShowLightbox(true) }}>
                                <img src={comparisonState.oldUrl} alt="Previous" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={() => handleComparisonDecision('revert_old')}
                                >
                                    Keep Old
                                </Button>
                            </div>
                        </div>
                        {/* NEW (Right) */}
                        <div className="relative rounded-lg overflow-hidden border border-slate-200">
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-2 bg-gradient-to-b from-black/60 to-transparent">
                                <span className="text-xs font-bold tracking-wider text-white uppercase px-2 py-0.5 bg-green-600/90 rounded">NEW</span>
                            </div>
                            <div className="aspect-[9/16] bg-gray-100 cursor-pointer" onClick={() => { setComparisonLightboxUrl(comparisonState.newUrl); setShowLightbox(true) }}>
                                <img src={comparisonState.newUrl} alt="New" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-2">
                                <Button
                                    size="sm"
                                    className="w-full text-xs bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleComparisonDecision('keep_new')}
                                >
                                    Keep New
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Error Display */}
                        {generationError && (
                            <div className="mx-4 mb-2">
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-red-800">{generationError.message}</p>
                                            <button
                                                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                                                className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                                            >
                                                <ChevronRight className={`w-3 h-3 transition-transform ${showTechnicalDetails ? 'rotate-90' : ''}`} />
                                                Details
                                            </button>
                                            {showTechnicalDetails && (
                                                <pre className="mt-1 p-2 bg-red-100 rounded text-xs text-red-700 overflow-x-auto whitespace-pre-wrap">
                                                    {generationError.technicalDetails}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Inner Grid: Sketch + Colored */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                            <div className="order-2 sm:order-1">
                                <SubCard
                                    title="Sketch"
                                    imageUrl={displaySketchImageUrl}
                                    isLoading={showSketchLoading}
                                    onClick={() => handleOpenLightbox('sketch')}
                                    characterName={displayName}
                                    onUpload={handleUploadSketch}
                                    onRetry={sketchHasError ? handleRetrySketch : undefined}
                                    showDownload={false}
                                    showUpload={true}
                                />
                            </div>
                            <div className="order-1 sm:order-2">
                                <SubCard
                                    title="Colored"
                                    imageUrl={displayColoredImageUrl}
                                    isLoading={showColoredLoading}
                                    onClick={() => handleOpenLightbox('colored')}
                                    characterName={displayName}
                                    onDownload={(e) => handleDownload('colored', e)}
                                    onUpload={handleUploadColored}
                                    onFileDrop={uploadColoredFile}
                                    showDownload={true}
                                    showUpload={true}
                                />
                            </div>
                        </div>
                    </>
                )}
            </Card>

            {/* Actions & Feedback Section - Outside Card */}
            <div className="w-full space-y-3">
                {/* Current Feedback (Resolved or Pending) */}
                {character.feedback_notes && character.is_resolved && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900 relative animate-in fade-in">
                        <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            <span className="font-semibold text-xs text-green-700 uppercase">Resolved (RESEND)</span>
                        </div>
                        <p className="text-green-800">{character.feedback_notes}</p>
                    </div>
                )}

                {character.feedback_notes && !character.is_resolved && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-900 relative animate-in fade-in">
                        <div className="flex items-start gap-2">
                            <MessageSquare className="w-4 h-4 text-yellow-600 mt-0.5" />
                            <div>
                                <span className="text-xs font-semibold text-yellow-800 uppercase block mb-1">Customer Feedback</span>
                                <p>{character.feedback_notes}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Resolved History */}
                {character.feedback_history?.map((item, index) => (
                    <div key={index} className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900 relative">
                        <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            <span className="font-semibold text-xs text-green-700 uppercase">Resolved</span>
                        </div>
                        <p className="text-green-800 opacity-90">{item.note}</p>
                    </div>
                ))}
            </div>

            {/* Full View Lightbox */}
            <Dialog open={showLightbox} onOpenChange={(open) => { setShowLightbox(open); if (!open) setComparisonLightboxUrl(null) }}>
                <DialogContent 
                    showCloseButton={false}
                    className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                >
                    <DialogTitle className="sr-only">{displayName} - {lightboxImage}</DialogTitle>
                    <div className="relative w-full h-full flex items-center justify-center p-4" onClick={() => setShowLightbox(false)}>
                        {lightboxImageUrl && (
                            <img
                                src={lightboxImageUrl}
                                alt={`${displayName} - ${lightboxImage}`}
                                className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                        <button
                            className="absolute top-4 right-4 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowLightbox(false);
                            }}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}





