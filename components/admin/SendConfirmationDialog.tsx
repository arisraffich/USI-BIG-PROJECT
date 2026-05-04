'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send } from 'lucide-react'

interface SendConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onConfirm: (personalNote?: string) => void
  isLoading: boolean
}

export function SendConfirmationDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
  isLoading,
}: SendConfirmationDialogProps) {
  const [note, setNote] = useState('')

  const handleConfirm = () => {
    onConfirm(note.trim() || undefined)
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) setNote('')
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Add an optional personal note before sending this review email to the customer.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label className="text-sm font-medium text-slate-700 mb-1.5 block">
            Personal note <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a message for the customer..."
            className="min-h-[180px] resize-none"
            disabled={isLoading}
          />
          <p className="text-[11px] text-slate-400 mt-1.5">
            This note will appear in the customer&apos;s email before the review button.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading} className="bg-green-600 hover:bg-green-700 text-white">
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
