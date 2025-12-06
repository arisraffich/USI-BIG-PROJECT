'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Loader2, RefreshCw, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { useRouter } from 'next/navigation'

interface AdminCharacterGalleryCardProps {
    character: Character
    projectId: string
}

export function AdminCharacterGalleryCard({ character, projectId }: AdminCharacterGalleryCardProps) {
    const router = useRouter()
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [customPrompt, setCustomPrompt] = useState(character.generation_prompt || '')
    const [showImage, setShowImage] = useState(false)

    const handleRegenerate = async () => {
        setIsRegenerating(true)
        try {
            const response = await fetch('/api/characters/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    character_id: character.id,
                    custom_prompt: customPrompt.trim() || undefined // If empty, backend uses auto-prompt? Wait, backend uses custom if present. If undefined, uses builds.
                    // If user clears it, we might want auto.
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to regenerate character')
            }

            toast.success('Character regeneration started/completed')
            setIsDialogOpen(false)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Failed to regenerate')
        } finally {
            setIsRegenerating(false)
        }
    }

    const displayName = character.name || character.role || 'Unnamed Character'

    return (
        <>
            <Card className="flex flex-col h-full overflow-hidden">
                <div
                    className="relative aspect-[9/16] w-full bg-gray-100 cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => setShowImage(true)}
                >
                    {character.image_url ? (
                        <img
                            src={character.image_url}
                            alt={displayName}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full text-gray-400">
                            <span className="text-lg">No Image</span>
                        </div>
                    )}
                </div>

                <CardContent className="flex-1 flex flex-col p-4 space-y-4">
                    <div>
                        <h3 className="font-bold text-lg">{displayName}</h3>
                        {character.story_role && (
                            <p className="text-sm text-gray-500 line-clamp-2">{character.story_role}</p>
                        )}
                    </div>

                    {/* Feedback Notes Display */}
                    {character.feedback_notes && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                            <div className="flex items-start gap-2">
                                <MessageSquare className="w-4 h-4 text-yellow-600 mt-0.5" />
                                <div>
                                    <span className="text-xs font-semibold text-yellow-800 uppercase block mb-1">Customer Feedback</span>
                                    <p className="text-sm text-yellow-900">{character.feedback_notes}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-auto pt-4">
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="w-full" variant="outline" disabled={character.is_main}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Regenerate
                                </Button>
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
                                            placeholder="Enter a custom prompt or leave empty to use auto-generated prompt based on attributes..."
                                            className="min-h-[150px]"
                                        />
                                        <p className="text-xs text-gray-500">
                                            If you leave this empty, the system will construct a prompt based on the character's attributes.
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleRegenerate} disabled={isRegenerating}>
                                        {isRegenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Generate
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardContent>
            </Card>

            {/* Full View Lightbox */}
            <Dialog open={showImage} onOpenChange={setShowImage}>
                <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none">
                    <DialogTitle className="sr-only">{displayName}</DialogTitle>
                    {character.image_url && (
                        <img
                            src={character.image_url}
                            alt={displayName}
                            className="max-w-full max-h-[90vh] object-contain rounded-md"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
