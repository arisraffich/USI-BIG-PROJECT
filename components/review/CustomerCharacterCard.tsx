'use client'

import { memo } from 'react'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { UniversalCharacterCard, CharacterFormData } from '@/components/shared/UniversalCharacterCard'

interface CustomerCharacterCardProps {
  character: Character
  isGenerating?: boolean
  onChange?: (id: string, data: any, isValid: boolean) => void
  onSaved?: (id: string) => void
  isLocked?: boolean
  showSaveToast?: boolean
}

export const CustomerCharacterCard = memo(function CustomerCharacterCard({
  character,
  isGenerating = false,
  onChange,
  onSaved,
  isLocked = false,
  showSaveToast = true
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

      if (showSaveToast) {
        toast.success('Character updated')
      }
      onSaved?.(character.id)
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
      alwaysEditing={false} // Enable Lock-on-Save behavior
      hideSaveButton={false}
      onChange={handleChange}
      isLocked={isLocked}
    />
  )
})














