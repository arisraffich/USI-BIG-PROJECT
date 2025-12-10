'use client'

import { memo } from 'react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { UniversalCharacterCard, CharacterFormData } from '@/components/shared/UniversalCharacterCard'

interface CustomerCharacterCardProps {
  character: Character
  isGenerating?: boolean
  onChange?: (id: string, data: any, isValid: boolean) => void
}

export const CustomerCharacterCard = memo(function CustomerCharacterCard({
  character,
  isGenerating = false,
  onChange
}: CustomerCharacterCardProps) {

  const handleSave = async (data: CharacterFormData) => {
    // Legacy save - disable or keep as backup
    // With hideSaveButton, this is only called if we manually trigger it
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
      throw error
    }
  }

  const handleChange = (data: CharacterFormData, isValid: boolean) => {
    if (onChange) {
      onChange(character.id, data, isValid)
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
      hideSaveButton={!character.is_main} // Hide save button for editable cards (Main is read-only anyway)
      onChange={handleChange}
    />
  )
})






