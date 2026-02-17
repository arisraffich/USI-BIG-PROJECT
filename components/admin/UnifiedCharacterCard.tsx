import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Loader2, RefreshCw, MessageSquare, CheckCircle2, Info, Download, Upload, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { createClient } from '@/lib/supabase/client'
import { getErrorMessage } from '@/lib/utils/error'

interface UnifiedCharacterCardProps {
    character: Character
    projectId: string
    isGenerating?: boolean
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
    showUpload?: boolean
    showDownload?: boolean
}

function SubCard({ title, imageUrl, isLoading, onClick, characterName, onDownload, onUpload, onRetry, showUpload = false, showDownload = true }: SubCardProps) {
    // Check if imageUrl contains an error
    const isError = imageUrl?.startsWith('error:') ?? false
    const errorMessage = isError && imageUrl ? imageUrl.replace('error:', '') : null
    const actualImageUrl = isError ? null : imageUrl

    return (
        <div className="relative w-full">
            {/* Image Container */}
            <div 
                className={`relative aspect-[9/16] rounded-lg cursor-pointer hover:opacity-95 transition-opacity overflow-hidden ${isError ? 'bg-red-50 border-2 border-red-200' : 'bg-gray-100'}`}
                onClick={actualImageUrl ? onClick : undefined}
            >
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
                        
                        {/* Upload Button Overlay - Inside image container */}
                        {showUpload && onUpload && (
                            <div className="absolute top-2 right-2 z-10">
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
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <span className="text-sm">No Image</span>
                    </div>
                )}

                {/* Loading Overlay - Don't show if there's an error */}
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

export function UnifiedCharacterCard({ character, projectId, isGenerating = false }: UnifiedCharacterCardProps) {
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [customPrompt, setCustomPrompt] = useState(character.generation_prompt || '')
    const [showLightbox, setShowLightbox] = useState(false)
    const [lightboxImage, setLightboxImage] = useState<'sketch' | 'colored' | null>(null)
    const [showTooltip, setShowTooltip] = useState(false)
    const [optimisticColoredImage, setOptimisticColoredImage] = useState<string | null>(null)
    const [localCharacter, setLocalCharacter] = useState(character)
    const [isSketchGenerating, setIsSketchGenerating] = useState(false)
    const [referenceImage, setReferenceImage] = useState<{ file: File; preview: string } | null>(null)
    const referenceInputRef = useRef<HTMLInputElement>(null)

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

    const handleReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        
        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB')
            return
        }
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }
        
        const preview = URL.createObjectURL(file)
        setReferenceImage({ file, preview })
        
        // Reset input so same file can be selected again
        if (referenceInputRef.current) {
            referenceInputRef.current.value = ''
        }
    }

    const removeReferenceImage = () => {
        if (referenceImage?.preview) {
            URL.revokeObjectURL(referenceImage.preview)
        }
        setReferenceImage(null)
    }

    const handleRegenerate = async () => {
        setIsDialogOpen(false)
        setIsRegenerating(true)
        try {
            // Convert reference image to base64 if provided
            let visualReferenceImage: string | undefined
            if (referenceImage?.file) {
                visualReferenceImage = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = reject
                    reader.readAsDataURL(referenceImage.file)
                })
            }

            const response = await fetch('/api/characters/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    character_id: character.id,
                    custom_prompt: customPrompt.trim() || undefined,
                    visual_reference_image: visualReferenceImage
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
                setOptimisticColoredImage(result.image_url)
            }

            toast.success('Character regenerated successfully')
            // Clear reference image after successful regeneration
            removeReferenceImage()
        } catch (error: unknown) {
            console.error('Regeneration error:', error)
            toast.error(getErrorMessage(error, 'Failed to regenerate'))
            setIsDialogOpen(true)
        } finally {
            setIsRegenerating(false)
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

    const handleUploadColored = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

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
            
            // Preload the new image and clear sketch state to show spinner
            if (data.imageUrl) {
                await new Promise((resolve) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = resolve
                    img.src = data.imageUrl
                })
                setOptimisticColoredImage(data.imageUrl)
                // Clear sketch to show spinner while generating
                setLocalCharacter(prev => ({ ...prev, sketch_url: null }))
            }

            // Upload done — stop colored loading (finally block also handles this for error cases)
            setIsRegenerating(false)

            // Trigger sketch generation
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
            // Reset file input
            e.target.value = ''
        }
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

    const displayName = character.is_main
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

    const displayColoredImageUrl = optimisticColoredImage || localCharacter.image_url
    const displaySketchImageUrl = localCharacter.sketch_url
    const sketchHasError = !!(displaySketchImageUrl && displaySketchImageUrl.startsWith('error:'))
    const sketchIsReady = !!(displaySketchImageUrl && !sketchHasError)

    // Show loading on colored if regenerating OR if project generating and no image
    const showColoredLoading = !!(isRegenerating || (isGenerating && !displayColoredImageUrl))
    
    // Show loading on sketch ONLY when:
    // 1. We explicitly started sketch generation (isSketchGenerating), OR
    // 2. Parent says project is generating AND colored exists but sketch isn't ready yet
    const showSketchLoading = !!(isSketchGenerating || (isGenerating && displayColoredImageUrl && !sketchIsReady && !sketchHasError))

    const lightboxImageUrl = lightboxImage === 'sketch' ? displaySketchImageUrl : displayColoredImageUrl

    return (
        <div className="flex flex-col w-full gap-4">
            <Card className="flex flex-col w-full p-0 gap-0 border-0 shadow-[0_0_15px_rgba(0,0,0,0.12)]">
                <CardContent className="flex-1 flex flex-col p-4 bg-white rounded-t-lg">
                    <div className="flex justify-between items-center gap-2 relative">
                        <div className="flex items-center gap-2">
                            {/* Info Button - Left Side */}
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
                            {/* Download Button - Back in header */}
                            <button
                                onClick={(e) => handleDownload('colored', e)}
                                disabled={!displayColoredImageUrl}
                                className="transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80"
                                title="Download Colored"
                            >
                                <Download className="w-[18px] h-[18px] text-gray-700" />
                            </button>

                            {/* Regenerate Dialog Trigger - Icon Only */}
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
                                                    <span className="text-xs text-gray-400">Max 2MB</span>
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
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full border-dashed border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50 gap-2 h-16"
                                                        onClick={() => referenceInputRef.current?.click()}
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                        Add Reference Image
                                                    </Button>
                                                )}

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
                        </div>
                    </div>
                </CardContent>

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
                            onUpload={handleUploadColored}
                            showDownload={false}
                            showUpload={true}
                        />
                    </div>
                </div>
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
            <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
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





