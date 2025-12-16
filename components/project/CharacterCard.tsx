'use client'

import { memo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Character } from '@/types/character'
import { UniversalCharacterCard, CharacterFormData } from '@/components/shared/UniversalCharacterCard'

interface CharacterCardProps {
  character: Character
  readOnly?: boolean
  onChange?: (id: string, data: any, isValid: boolean) => void
}

export const CharacterCard = memo(function CharacterCard({
  character,
  readOnly = true,
  onChange
}: CharacterCardProps) {
  const router = useRouter()

  const handleSave = async (data: CharacterFormData) => {
    try {
      const response = await fetch(`/api/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to save character')
      }

      toast.success('Character updated')
      router.refresh()
    } catch (error) {
      toast.error('Failed to save character')
      throw error
    }
  }

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/characters/${character.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete character')
      }

      toast.success('Character deleted')
      router.refresh()
    } catch (error) {
      toast.error('Failed to delete character')
      throw error
    }
  }

  // Handle local changes for parent form tracking
  const handleChange = (data: CharacterFormData, isValid: boolean) => {
    if (onChange) {
      onChange(character.id, data, isValid)
    }
  }

  return (
    <UniversalCharacterCard
      character={character}
      onSave={handleSave}
      onDelete={handleDelete}
      readOnly={readOnly}
      alwaysEditing={!readOnly}
      onChange={handleChange}
    />
  )
})
