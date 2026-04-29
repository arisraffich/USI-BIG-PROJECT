'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MAX_FOLLOW_UP_SEQUENCE } from '@/lib/project-followups'

interface FollowUpDraft {
  stageLabel: string
  sequence: number
  count: number
  max: number
  lastSentAt: string | null
  recipientEmail: string
  subject: string
  bodyText: string
  closingText: string
  buttonText: string
  reviewUrl: string
}

interface FollowUpButtonProps {
  projectId: string
  initialCount?: number
  initialLastSentAt?: string | null
  initialIsSending?: boolean
}

function formatShortDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Yerevan',
  })
}

export function FollowUpButton({
  projectId,
  initialCount = 0,
  initialLastSentAt = null,
  initialIsSending = false,
}: FollowUpButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [lastSentAt, setLastSentAt] = useState<string | null>(initialLastSentAt)
  const [draft, setDraft] = useState<FollowUpDraft | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [closingText, setClosingText] = useState('')

  const maxReached = count >= MAX_FOLLOW_UP_SEQUENCE
  const lastSentLabel = formatShortDate(lastSentAt)

  useEffect(() => {
    if (open) return
    setCount(initialCount)
    setLastSentAt(initialLastSentAt)
  }, [initialCount, initialLastSentAt, open])

  useEffect(() => {
    if (!open || maxReached) return

    let cancelled = false

    async function loadDraft() {
      setLoading(true)
      try {
        const response = await fetch(`/api/projects/${projectId}/follow-up`)
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load follow-up email')
        }

        if (cancelled) return

        setDraft(data)
        setCount(data.count)
        setLastSentAt(data.lastSentAt)
        setRecipientEmail(data.recipientEmail)
        setSubject(data.subject)
        setBodyText(data.bodyText)
        setClosingText(data.closingText || '')
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load follow-up email')
          setOpen(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDraft()

    return () => {
      cancelled = true
    }
  }, [open, projectId, maxReached])

  const handleSend = async () => {
    if (!draft || sending) return

    setSending(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail, subject, bodyText, closingText }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send follow-up email')
      }

      setCount(data.count)
      setLastSentAt(data.lastSentAt)
      setOpen(false)
      toast.success('Follow-up email sent')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send follow-up email')
    } finally {
      setSending(false)
    }
  }

  if (maxReached) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 shadow-sm cursor-not-allowed"
      >
        <UserRound className="w-3 h-3" />
        <span>Max Sent</span>
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={initialIsSending}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-800 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-950 disabled:opacity-60 disabled:cursor-wait"
      >
        {initialIsSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserRound className="w-3 h-3" />}
        <span>{initialIsSending ? 'Sending' : 'Follow Up'}</span>
        <span>{count}/{MAX_FOLLOW_UP_SEQUENCE}</span>
        {lastSentLabel && (
          <span className="hidden lg:inline text-gray-500">· {lastSentLabel}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft ? `${draft.stageLabel} ${draft.sequence}/${draft.max}` : 'Follow-Up Email'}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : draft ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send To</label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
                <Textarea
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  className="min-h-[170px] resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Closing Text</label>
                <Textarea
                  value={closingText}
                  onChange={(event) => setClosingText(event.target.value)}
                  className="min-h-[100px] resize-y"
                />
              </div>

            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={!draft || sending || !recipientEmail.trim() || !subject.trim() || !bodyText.trim()}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Follow-Up
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
