'use client'

import { Button } from '@/components/ui/button'
import { Edit2, X, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ManuscriptToolbarProps {
  isEditMode: boolean
  onEditClick: () => void
  onCancelClick: () => void
  onSaveClick: () => void
  isSaving: boolean
  isDirty: boolean
  isCustomerView?: boolean // Hide Download button for customer views
}

export function ManuscriptToolbar({
  isEditMode,
  onEditClick,
  onCancelClick,
  onSaveClick,
  isSaving,
  isDirty,
  isCustomerView = false,
}: ManuscriptToolbarProps) {
  const handleDownloadClick = () => {
    toast.info('Download feature coming soon!')
  }

  return (
    <div className="fixed top-[88px] right-[42px] z-40 flex flex-col items-end gap-2">
      {!isEditMode ? (
        <Button
          variant="default"
          size="sm"
          onClick={onEditClick}
          className="bg-gray-900 hover:bg-gray-800 text-white shadow-md"
        >
          <Edit2 className="w-4 h-4 mr-2" />
          Edit Manuscript
        </Button>
      ) : (
        <div className="flex flex-col items-end gap-2">
          {/* Save Button - Primary */}
          <Button
            variant="default"
            size="sm"
            onClick={onSaveClick}
            disabled={isSaving || !isDirty}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md w-full min-w-[140px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>

          {/* Cancel Button - Secondary */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelClick}
            disabled={isSaving}
            className="text-gray-500 hover:text-gray-900 hover:bg-white/50 w-full"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
