'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Character } from '@/types/character'
import { UniversalCharacterCard, CharacterFormData } from '@/components/shared/UniversalCharacterCard'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/utils/error'

interface NewCharacterFormCardProps {
    character: Character
    projectId: string
}

export function NewCharacterFormCard({ character, projectId }: NewCharacterFormCardProps) {
    const router = useRouter()
    const [isGenerating, setIsGenerating] = useState(false)
    const [formData, setFormData] = useState<CharacterFormData | null>(null)
    const [isFormValid, setIsFormValid] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const handleFormChange = (data: CharacterFormData, valid: boolean) => {
        setFormData(data)
        setIsFormValid(valid)
    }

    const handleSave = async (data: CharacterFormData) => {
        setIsSaving(true)
        try {
            const res = await fetch(`/api/characters/${character.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    age: data.age,
                    gender: data.gender,
                    skin_color: data.skin_color,
                    hair_color: data.hair_color,
                    hair_style: data.hair_style,
                    eye_color: data.eye_color,
                    clothing: data.clothing,
                    accessories: data.accessories,
                    special_features: data.special_features,
                }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to save')
            }
            toast.success('Character details saved')
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save character'))
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        try {
            const res = await fetch(`/api/characters/${character.id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to delete')
            toast.success('Character deleted')
            router.refresh()
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete character'))
        }
    }

    const handleSaveAndGenerate = async () => {
        if (!isFormValid || !formData) return

        setIsGenerating(true)
        try {
            // Step 1: Save form data
            await handleSave(formData)

            // Step 2: Trigger character generation
            const genRes = await fetch('/api/characters/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    character_id: character.id,
                    skipStatusUpdate: true,
                }),
            })

            const genData = await genRes.json()
            if (!genRes.ok) {
                throw new Error(genData.error || 'Failed to generate character')
            }

            const result = genData.results?.find((r: any) => r.character_id === character.id)
            if (genData.failed > 0 || (result && !result.success)) {
                throw new Error(result?.error || 'Generation failed')
            }

            toast.success('Character generated! Sketch generating...', { duration: 5000 })

            // Trigger sketch generation
            if (result?.image_url) {
                fetch('/api/characters/generate-sketch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ characterId: character.id, imageUrl: result.image_url }),
                }).catch(err => console.error('Sketch generation error:', err))
            }

            router.refresh()
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to generate character'))
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div className="space-y-3">
            <UniversalCharacterCard
                character={character}
                onSave={handleSave}
                onDelete={handleDelete}
                isGenerating={isGenerating}
                alwaysEditing
                hideSaveButton
                onChange={handleFormChange}
                enablePhotoUpload
            />
            <Button
                onClick={handleSaveAndGenerate}
                disabled={!isFormValid || isGenerating || isSaving}
                className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white font-medium gap-2"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4" />
                        Save &amp; Generate
                    </>
                )}
            </Button>
        </div>
    )
}
