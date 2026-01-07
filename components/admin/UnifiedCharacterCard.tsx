import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Loader2, RefreshCw, MessageSquare, CheckCircle2, Info, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    showUpload?: boolean
    showDownload?: boolean
}

function SubCard({ title, imageUrl, isLoading, onClick, characterName, onDownload, onUpload, showUpload = false, showDownload = true }: SubCardProps) {
    return (
        <div className="relative w-full">
            {/* Image Container */}
            <div 
                className="relative aspect-[9/16] bg-gray-100 rounded-lg cursor-pointer hover:opacity-95 transition-opacity overflow-hidden"
                onClick={imageUrl ? onClick : undefined}
            >
                {imageUrl ? (
                    <>
                        <img 
                            src={imageUrl} 
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

                {/* Loading Overlay */}
                {isLoading && (
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
    const router = useRouter()
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [customPrompt, setCustomPrompt] = useState(character.generation_prompt || '')
    const [showLightbox, setShowLightbox] = useState(false)
    const [lightboxImage, setLightboxImage] = useState<'sketch' | 'colored' | null>(null)
    const [showTooltip, setShowTooltip] = useState(false)
    const [optimisticColoredImage, setOptimisticColoredImage] = useState<string | null>(null)
    const [localCharacter, setLocalCharacter] = useState(character)

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
                        router.refresh()
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [character.id, router])

    const handleOpenRegenerate = () => {
        let prompt = character.generation_prompt || ''
        if (character.feedback_notes && !character.is_resolved) {
            prompt = `CUSTOMER REQUEST: ${character.feedback_notes}\n\n${prompt}`
        }
        setCustomPrompt(prompt)
        setIsDialogOpen(true)
    }

    const handleRegenerate = async () => {
        setIsDialogOpen(false)
        setIsRegenerating(true)
        try {
            const response = await fetch('/api/characters/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    character_id: character.id,
                    custom_prompt: customPrompt.trim() || undefined
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
        } catch (error: any) {
            console.error('Regeneration error:', error)
            toast.error(error.message || 'Failed to regenerate')
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
            
            // Preload the new image
            if (data.imageUrl) {
                await new Promise((resolve) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = resolve
                    img.src = data.imageUrl
                })
                setOptimisticColoredImage(data.imageUrl)
            }
        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error(error.message || 'Failed to upload colored image')
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
        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error(error.message || 'Failed to upload sketch')
        } finally {
            setIsRegenerating(false)
            // Reset file input
            e.target.value = ''
        }
    }

    const displayName = character.is_main
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

    const displayColoredImageUrl = optimisticColoredImage || localCharacter.image_url
    const displaySketchImageUrl = localCharacter.sketch_url

    // Show loading on colored if regenerating OR if project generating and no image
    const showColoredLoading = !!(isRegenerating || (isGenerating && !displayColoredImageUrl))
    
    // Show loading on sketch if colored exists but sketch doesn't (sketch generation in progress)
    const showSketchLoading = !!(displayColoredImageUrl && !displaySketchImageUrl && !isRegenerating)

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
                            {!character.is_main && (
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
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Regenerate {displayName}</DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Generation Prompt</label>
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
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                            <Button onClick={handleRegenerate} disabled={isRegenerating}>
                                                {isRegenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                Regenerate
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
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
                <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none">
                    <DialogTitle className="sr-only">{displayName} - {lightboxImage}</DialogTitle>
                    {lightboxImageUrl && (
                        <img
                            src={lightboxImageUrl}
                            alt={`${displayName} - ${lightboxImage}`}
                            className="max-w-full max-h-[90vh] object-contain rounded-md"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}





