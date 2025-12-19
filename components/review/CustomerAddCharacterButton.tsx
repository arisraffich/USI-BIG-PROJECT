'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'

interface CustomerAddCharacterButtonProps {
  projectId: string
  mainCharacterName: string | null
  onCharacterAdded: () => void
  mode?: 'button' | 'card'
}

export function CustomerAddCharacterButton({
  projectId,
  mainCharacterName,
  onCharacterAdded,
  mode = 'button'
}: CustomerAddCharacterButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAddingCharacter, setIsAddingCharacter] = useState(false)
  const [nameRole, setNameRole] = useState('')
  const [description, setDescription] = useState('')

  const nameRolePlaceholder = mainCharacterName
    ? `e.g., Mom, ${mainCharacterName}'s mother, or Character Name`
    : 'e.g., Mom, Character Name, or Role'
  const descriptionPlaceholder = mainCharacterName
    ? `${mainCharacterName}'s mother, who narrates the story of ${mainCharacterName}'s early life and achievements, providing love and support.`
    : "The main character's mother, who narrates the story of their early life and achievements, providing love and support."

  async function handleCreateCharacter() {
    if (!projectId) return

    if (!nameRole.trim()) {
      toast.error('Name/Role is required')
      return
    }

    setIsAddingCharacter(true)
    try {
      const response = await fetch('/api/review/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: nameRole.trim() || null,
          role: nameRole.trim() || null,
          story_role: description.trim() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create character')
      }

      toast.success('Character added successfully')
      setIsOpen(false)
      setNameRole('')
      setDescription('')
      onCharacterAdded()
    } catch (error: any) {
      toast.error('Failed to add character', {
        description: error.message || 'An error occurred',
      })
    } finally {
      setIsAddingCharacter(false)
    }
  }

  function handleCancel() {
    setIsOpen(false)
    setNameRole('')
    setDescription('')
  }

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add New Character</DialogTitle>
        <DialogDescription>
          Enter the character's name or role and a brief description.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name-role">Name/Role</Label>
          <Input
            id="name-role"
            placeholder={nameRolePlaceholder}
            value={nameRole}
            onChange={(e) => setNameRole(e.target.value)}
            disabled={isAddingCharacter}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder={descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isAddingCharacter}
            rows={4}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={isAddingCharacter}
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreateCharacter}
          disabled={isAddingCharacter || !nameRole.trim()}
        >
          {isAddingCharacter ? 'Creating...' : 'Create'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )

  if (mode === 'card') {
    return (
      <>
        <div
          onClick={() => setIsOpen(true)}
          className="cursor-pointer group flex flex-col items-center justify-center gap-4 p-8 min-h-[300px] h-full rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-300"
        >
          <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Plus className="w-7 h-7 text-gray-400 group-hover:text-blue-500" />
          </div>
          <div className="text-center space-y-1">
            <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Add New Character</h4>
            <p className="text-sm text-gray-500 max-w-[200px]">Create a new character profile manually</p>
          </div>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          {dialogContent}
        </Dialog>
      </>
    )
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 m-[15px] h-[47px] px-[calc(1rem+15px)]"
      >
        <Plus className="w-4 h-4" />
        Add Character
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {dialogContent}
      </Dialog>
    </>
  )
}










