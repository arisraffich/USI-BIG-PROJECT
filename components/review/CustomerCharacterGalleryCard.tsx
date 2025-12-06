'use client'

import { useState } from 'react'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquarePlus, Save, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CustomerCharacterGalleryCardProps {
    character: Character
    isMain?: boolean
}

export function CustomerCharacterGalleryCard({ character, isMain = false }: CustomerCharacterGalleryCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [notes, setNotes] = useState(character.feedback_notes || '')
    const [isSaving, setIsSaving] = useState(false)

    const displayName = isMain
        ? 'Main Character'
        : (character.name || character.role || 'Unnamed Character')

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
        <div className="flex flex-col items-center bg-white rounded-xl shadow-sm border p-4 w-full h-full transition-all hover:shadow-md">
            {/* Large Image Area */}
            <div className="w-full aspect-square relative mb-4 rounded-lg overflow-hidden bg-gray-50 border">
                {character.image_url ? (
                    <img
                        src={character.image_url}
                        alt={displayName}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No Image Generated
                    </div>
                )}
            </div>

            {/* Name / Role */}
            <h3 className="font-bold text-lg text-gray-900 mb-1 text-center font-serif">
                {displayName}
            </h3>

            {/* Additional context if needed */}
            {!isMain && character.role && character.name && (
                <p className="text-sm text-gray-500 mb-3 text-center">{character.role}</p>
            )}

            {/* Change Request Section */}
            {!isMain && (
                <div className="w-full mt-2">
                    {!isEditing && !character.feedback_notes ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                            onClick={() => setIsEditing(true)}
                        >
                            <MessageSquarePlus className="w-4 h-4" />
                            Request Changes
                        </Button>
                    ) : (
                        <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                            {!isEditing && character.feedback_notes && (
                                <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm text-amber-900 mb-2 relative group">
                                    <p className="font-semibold text-xs text-amber-700 uppercase mb-1">Your Request:</p>
                                    {character.feedback_notes}
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

                            {isEditing && (
                                <>
                                    <Textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Describe the changes you would like to see..."
                                        className="min-h-[100px] text-sm resize-none focus-visible:ring-blue-500"
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
                                            Save Request
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
