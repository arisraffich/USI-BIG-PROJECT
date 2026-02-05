import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { MessageSquarePlus, Save, Loader2, CheckCircle2, Info, Download, X, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getErrorMessage } from '@/lib/utils/error'

interface CustomerCharacterGalleryCardProps {
    character: Character
    isMain?: boolean
}

interface SubCardProps {
    title: string
    imageUrl: string | null | undefined
    onClick: () => void
    characterName: string
}

function SubCard({ title, imageUrl, onClick, characterName }: SubCardProps) {
    // Check if imageUrl contains an error
    const isError = imageUrl?.startsWith('error:') ?? false
    const errorMessage = isError && imageUrl ? imageUrl.replace('error:', '') : null
    const actualImageUrl = isError ? null : imageUrl

    return (
        <div className="relative">
            {/* Image Container */}
            <div 
                className={`aspect-[9/16] rounded-lg cursor-pointer hover:opacity-95 transition-opacity overflow-hidden ${isError ? 'bg-red-50' : 'bg-gray-100'}`}
                onClick={actualImageUrl ? onClick : undefined}
            >
                {isError ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-600 p-3">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <span className="text-xs font-medium text-center">Generation Failed</span>
                    </div>
                ) : actualImageUrl ? (
                    <img 
                        src={actualImageUrl} 
                        alt={`${characterName} - ${title}`} 
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <span className="text-sm">No Image</span>
                    </div>
                )}
            </div>
        </div>
    )
}

export function CustomerCharacterGalleryCard({ character, isMain = false }: CustomerCharacterGalleryCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [notes, setNotes] = useState(character.feedback_notes || '')
    const [isSaving, setIsSaving] = useState(false)
    const [showLightbox, setShowLightbox] = useState(false)
    const [lightboxImage, setLightboxImage] = useState<'sketch' | 'colored' | null>(null)
    const [showTooltip, setShowTooltip] = useState(false)
    const [localCharacter, setLocalCharacter] = useState(character)
    const router = useRouter()

    // Update local character when prop changes
    useEffect(() => {
        setLocalCharacter(character)
    }, [character])

    // Realtime subscription for sketch updates
    useEffect(() => {
        const supabase = createClient()
        const channel = supabase
            .channel(`customer-character-sketch-${character.id}`)
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

    const displayName = isMain
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

    const handleDownload = async (type: 'sketch' | 'colored', e: React.MouseEvent) => {
        e.stopPropagation()
        const imageUrl = type === 'sketch' ? localCharacter.customer_sketch_url : localCharacter.customer_image_url
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

    const handleOpenLightbox = (type: 'sketch' | 'colored') => {
        setLightboxImage(type)
        setShowLightbox(true)
    }

    const handleSaveNotes = async () => {
        if (!notes.trim()) {
            setIsEditing(false)
            return
        }

        setIsSaving(true)
        try {
            const response = await fetch(`/api/review/characters/${character.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback_notes: notes }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || 'Failed to save notes')
            }

            toast.success('Change request saved')
            setIsEditing(false)
            // Update handled by realtime subscription
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to save change request'))
            console.error('Save error:', error)
        } finally {
            setIsSaving(false)
        }
    }

    const displaySketchImageUrl = localCharacter.customer_sketch_url
    const displayColoredImageUrl = localCharacter.customer_image_url
    const lightboxImageUrl = lightboxImage === 'sketch' ? displaySketchImageUrl : displayColoredImageUrl

    return (
        <div className="flex flex-col w-full gap-4">
            {/* Character Card with Paired Images */}
            <Card className="flex flex-col w-full p-0 gap-0 border-0 shadow-[0_0_15px_rgba(0,0,0,0.12)]">
                <CardContent className="flex-1 flex flex-col p-4 bg-white rounded-t-lg">
                    <div className="flex justify-between items-center gap-2 relative">
                        <div className="flex items-center gap-2">
                            {/* Info Button - Left Side */}
                            {(character.story_role || character.role) && (
                                <div
                                    className="relative flex-shrink-0"
                                    onMouseEnter={() => setShowTooltip(true)}
                                    onMouseLeave={() => setShowTooltip(false)}
                                >
                                    <Info className="w-5 h-5 fill-slate-900 text-white hover:fill-slate-700 cursor-help transition-colors" />
                                    {showTooltip && (
                                        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-md shadow-xl z-50 text-left">
                                            <div className="absolute bottom-[-4px] left-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                                            <p className="font-bold mb-1 text-sm">{isMain ? `${character.name || character.role || 'Character'} | Main Character` : displayName}</p>
                                            <p className="leading-relaxed whitespace-pre-wrap select-text">{character.story_role || character.role}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <h3 className="font-bold text-lg text-gray-900 leading-tight">
                                {displayName.length > 14 ? `${displayName.slice(0, 14)}...` : displayName}
                            </h3>
                        </div>

                        {/* Center: Request Edits Button (Desktop only, secondary characters only) */}
                        {!isMain && !isEditing && !character.feedback_notes && (
                            <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-2 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 shadow-sm bg-white"
                                    onClick={() => setIsEditing(true)}
                                >
                                    <MessageSquarePlus className="w-4 h-4" />
                                    Request Edits
                                </Button>
                            </div>
                        )}

                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Download Button */}
                            <button
                                onClick={(e) => handleDownload('colored', e)}
                                disabled={!displayColoredImageUrl}
                                className="transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80"
                                title="Download"
                            >
                                <Download className="w-[18px] h-[18px] text-gray-700" />
                            </button>
                        </div>
                    </div>
                </CardContent>

                {/* Inner Grid: Sketch + Colored */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                    <div className="order-2 sm:order-1">
                        <SubCard
                            title="Sketch"
                            imageUrl={displaySketchImageUrl}
                            onClick={() => handleOpenLightbox('sketch')}
                            characterName={displayName}
                        />
                    </div>
                    <div className="order-1 sm:order-2">
                        <SubCard
                            title="Colored"
                            imageUrl={displayColoredImageUrl}
                            onClick={() => handleOpenLightbox('colored')}
                            characterName={displayName}
                        />
                    </div>
                </div>
            </Card>

            {/* Actions & Feedback Section - Outside Card */}
            {!isMain && (
                <div className="w-full space-y-3">
                    {/* Pending Request (Yellow) */}
                    {!isEditing && character.feedback_notes && (
                        <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm text-amber-900 relative group animate-in fade-in zoom-in-95 duration-200">
                            <p className="font-semibold text-xs text-amber-700 uppercase mb-1">Your Request:</p>
                            <p>{character.feedback_notes}</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1 h-6 px-2 text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-colors text-xs"
                                onClick={() => setIsEditing(true)}
                            >
                                Edit
                            </Button>
                        </div>
                    )}

                    {/* Request Button or Edit Form */}
                    {isEditing ? (
                        <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200 bg-white rounded-lg p-3 border shadow-sm">
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Describe the changes you would like to see..."
                                className="min-h-[80px] text-sm resize-none focus-visible:ring-blue-500"
                                autoFocus
                            />
                            <div className="flex gap-2 justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isSaving}
                                    onClick={() => {
                                        setIsEditing(false)
                                        setNotes(character.feedback_notes || '')
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={isSaving}
                                    onClick={handleSaveNotes}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-1" />
                                    )}
                                    Save
                                </Button>
                            </div>
                        </div>
                    ) : (
                        !character.feedback_notes && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-10 gap-2 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 shadow-sm bg-white lg:hidden"
                                onClick={() => setIsEditing(true)}
                            >
                                <MessageSquarePlus className="w-4 h-4" />
                                Request Edits
                            </Button>
                        )
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
            )}

            {/* Full View Lightbox */}
            <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
                <DialogContent 
                    showCloseButton={false}
                    className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                >
                    <DialogTitle className="sr-only">{displayName} - {lightboxImage}</DialogTitle>
                    <DialogDescription className="sr-only">Full size preview of {displayName} - {lightboxImage}</DialogDescription>
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
