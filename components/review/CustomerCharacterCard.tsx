'use client'

import { memo } from 'react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { UniversalCharacterCard, CharacterFormData } from '@/components/shared/UniversalCharacterCard'

interface CustomerCharacterCardProps {
  character: Character
  isGenerating?: boolean
}

export const CustomerCharacterCard = memo(function CustomerCharacterCard({
  character,
  isGenerating = false
}: CustomerCharacterCardProps) {

  const handleSave = async (data: CharacterFormData) => {
    try {
      const response = await fetch(`/api/review/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to save character')
      }

      toast.success('Character updated')
    } catch (error) {
      toast.error('Failed to save changes')
      throw error // Re-throw to let the child component know it failed
    }
  }

  // Customer view doesn't support deleting characters
  const handleDelete = undefined

  return (
    <UniversalCharacterCard
      character={character}
      onSave={handleSave}
      onDelete={handleDelete}
      isGenerating={isGenerating}
      readOnly={character.is_main}
      alwaysEditing={!character.is_main}
    />
  )
})






