import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Loader2, RefreshCw, MessageSquare, CheckCircle2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { useRouter } from 'next/navigation'

interface AdminCharacterGalleryCardProps {
    character: Character
    projectId: string
    isGenerating?: boolean
}

export function AdminCharacterGalleryCard({ character, projectId, isGenerating = false }: AdminCharacterGalleryCardProps) {
    const router = useRouter()
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [customPrompt, setCustomPrompt] = useState(character.generation_prompt || '')
    const [showImage, setShowImage] = useState(false)
    const [showTooltip, setShowTooltip] = useState(false)
    const [optimisticImage, setOptimisticImage] = useState<string | null>(null)

    const handleOpenRegenerate = () => {
        let prompt = character.generation_prompt || ''
        if (character.feedback_notes && !character.is_resolved) {
            prompt = `CUSTOMER REQUEST: ${character.feedback_notes}\n\n${prompt}`
        }
        setCustomPrompt(prompt)
        setIsDialogOpen(true)
    }

    const handleRegenerate = async () => {
        setIsDialogOpen(false) // Close immediately
        setIsRegenerating(true) // Show card loader
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

            // Check for functional failures even if HTTP 200
            const result = data.results?.find((r: any) => r.character_id === character.id)
            if (data.failed > 0 || (result && !result.success)) {
                throw new Error(result?.error || 'Generation failed on server')
            }

            // Preload new image to prevent flicker
            if (result?.image_url) {
                await new Promise((resolve) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = resolve // Don't block indefinitely
                    img.src = result.image_url
                })
                setOptimisticImage(result.image_url)
            }

            toast.success('Character generated successfully')
            // Character update handled by realtime subscription
        } catch (error: any) {
            console.error('Regeneration error:', error)
            toast.error(error.message || 'Failed to regenerate')
            // Don't close dialog on error so user keeps their prompt
            setIsDialogOpen(true)
        } finally {
            setIsRegenerating(false)
        }
    }

    const displayName = character.is_main
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

    // Use optimistic image if available, otherwise use character image
    const displayImageUrl = optimisticImage || character.image_url

    // Show loading overlay if explicitly regenerating OR if project is generating and this card has no image
    const showLoadingOverlay = isRegenerating || (isGenerating && !displayImageUrl)

    return (
        <div className="flex flex-col w-full gap-4">
            <Card className="flex flex-col w-full p-0 gap-0 border-0 shadow-md relative">
                {showLoadingOverlay && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
                        <div className="flex flex-col items-center gap-3 bg-white p-4 rounded-lg shadow-lg border border-blue-200">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
                                <div className="relative">
                                    <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                                </div>
                            </div>
                            <span className="text-sm font-medium text-gray-700">
                                {isRegenerating ? 'Regenerating...' : 'Generating...'}
                            </span>
                        </div>
                    </div>
                )}
                <div
                    className="relative aspect-[9/16] w-full bg-gray-100 cursor-pointer hover:opacity-95 transition-opacity rounded-t-lg overflow-hidden"
                    onClick={() => setShowImage(true)}
                >
                    {displayImageUrl ? (
                        <img
                            src={displayImageUrl}
                            alt={displayName}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full text-gray-400">
                            <span className="text-lg">No Image</span>
                        </div>
                    )}
                </div>

                <CardContent className="flex-1 flex flex-col p-4 bg-white rounded-b-lg">
                    <div className="flex justify-between items-center gap-2 relative">
                        <h3 className="font-bold text-lg text-gray-900 leading-tight">
                            {displayName.length > 14 ? `${displayName.slice(0, 14)}...` : displayName}
                        </h3>

                        <div className="flex items-center gap-2 flex-shrink-0">
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

                            {character.story_role && (
                                <div
                                    className="relative flex-shrink-0"
                                    onMouseEnter={() => setShowTooltip(true)}
                                    onMouseLeave={() => setShowTooltip(false)}
                                >
                                    <Info className="w-5 h-5 fill-slate-900 text-white hover:fill-slate-700 cursor-help transition-colors" />
                                    {showTooltip && (
                                        <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-md shadow-xl z-50 text-left">
                                            <div className="absolute bottom-[-4px] right-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                                            <p className="font-bold mb-1 text-sm">{character.is_main ? `${character.name || character.role || 'Character'} | Main Character` : displayName}</p>
                                            <p className="leading-relaxed whitespace-pre-wrap select-text">{character.story_role}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
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
            <Dialog open={showImage} onOpenChange={setShowImage}>
                <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none">
                    <DialogTitle className="sr-only">{displayName}</DialogTitle>
                    {displayImageUrl && (
                        <img
                            src={displayImageUrl}
                            alt={displayName}
                            className="max-w-full max-h-[90vh] object-contain rounded-md"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
