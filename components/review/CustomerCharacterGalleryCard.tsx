import { useState } from 'react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MessageSquarePlus, Save, Loader2, CheckCircle2, Info, Download } from 'lucide-react'

// ... existing imports ...

interface CustomerCharacterGalleryCardProps {
    character: Character
    isMain?: boolean
}

export function CustomerCharacterGalleryCard({ character, isMain = false }: CustomerCharacterGalleryCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [notes, setNotes] = useState(character.feedback_notes || '')
    const [isSaving, setIsSaving] = useState(false)
    const [showImage, setShowImage] = useState(false)
    const [showTooltip, setShowTooltip] = useState(false)

    const displayName = isMain
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!character.image_url) return

        try {
            const response = await fetch(character.image_url)
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            const cleanName = `${character.name || character.role || 'Character'}.png`
            link.download = cleanName
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            toast.success('Image downloaded')
        } catch (error) {
            console.error('Download failed:', error)
            toast.error('Failed to download image')
        }
    }

    // ... handleSaveNotes ...


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
                throw new Error('Failed to save notes')
            }

            toast.success('Change request saved')
            setIsEditing(false)
        } catch (error) {
            toast.error('Failed to save change request')
            console.error(error)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="flex flex-col w-full gap-4">
            {/* Character Card */}
            <Card className="flex flex-col w-full p-0 gap-0 border-0 shadow-md relative">
                <div
                    className="relative aspect-[9/16] w-full bg-gray-100 cursor-pointer hover:opacity-95 transition-opacity rounded-t-lg overflow-hidden"
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

                <CardContent className="flex-1 flex flex-col p-4 bg-white rounded-b-lg">
                    <div className="flex justify-between items-start gap-2 relative">
                        <h3 className="font-bold text-lg text-gray-900 leading-tight">
                            {displayName.length > 14 ? `${displayName.slice(0, 14)}...` : displayName}
                        </h3>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Download Button */}
                            {character.image_url && (
                                <div
                                    className="relative flex-shrink-0 cursor-pointer group rounded-full hover:bg-slate-100 p-1 transition-colors"
                                    onClick={handleDownload}
                                    title="Download image"
                                >
                                    <Download className="w-5 h-5 text-slate-400 group-hover:text-slate-700" />
                                </div>
                            )}

                            {(character.story_role || character.role) && (
                                <div
                                    className="relative flex-shrink-0"
                                    onMouseEnter={() => setShowTooltip(true)}
                                    onMouseLeave={() => setShowTooltip(false)}
                                >
                                    <Info className="w-5 h-5 fill-slate-900 text-white hover:fill-slate-700 cursor-help transition-colors" />
                                    {showTooltip && (
                                        <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-md shadow-xl z-50">
                                            <div className="absolute bottom-[-4px] right-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                                            <p className="font-bold mb-1 text-sm">{isMain ? `${character.name || character.role || 'Character'} | Main Character` : displayName}</p>
                                            <p className="leading-relaxed whitespace-pre-wrap select-text">{character.story_role || character.role}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
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
                                className="absolute top-1 right-1 h-6 px-2 text-amber-600 hover:text-amber-800 hover:bg-amber-100 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
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
                                className="w-full h-10 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 shadow-sm bg-white"
                                onClick={() => setIsEditing(true)}
                            >
                                <MessageSquarePlus className="w-4 h-4" />
                                Request Changes
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
        </div>
    )
}
