'use client'

import { Button } from '@/components/ui/button'
import { Edit2, Eye } from 'lucide-react'

interface EditToggleProps {
  isEditMode: boolean
  onToggle: () => void
  disabled?: boolean
}

export function EditToggle({ isEditMode, onToggle, disabled }: EditToggleProps) {
  return (
    <Button
      variant={isEditMode ? 'default' : 'outline'}
      size="sm"
      onClick={onToggle}
      disabled={disabled}
      className="gap-2"
    >
      {isEditMode ? (
        <>
          <Edit2 className="w-4 h-4" />
          <span>Edit Mode</span>
        </>
      ) : (
        <>
          <Eye className="w-4 h-4" />
          <span>Read Mode</span>
        </>
      )}
    </Button>
  )
}












