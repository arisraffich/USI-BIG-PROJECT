'use client'

import { memo } from 'react'
import { Page } from '@/types/page'
import { toast } from 'sonner'

// ... imports
import { SharedIllustrationBoard } from '@/components/illustration/SharedIllustrationBoard'

type CustomerIllustrationStatus = 'draft' | 'illustration_approved' | 'completed'

interface CustomerIllustrationReviewProps {
    page: Page
    onChange: (id: string, notes: string) => void
    illustrationStatus?: CustomerIllustrationStatus
    projectStatus?: string
    illustrationSendCount?: number
}

export const CustomerIllustrationReview = memo(function CustomerIllustrationReview({
    page,
    onChange,
    illustrationStatus = 'draft',
    projectStatus,
    illustrationSendCount = 0
}: CustomerIllustrationReviewProps) {

    // Wrapper for Save Logic to pass to Shared Board
    const handleSaveFeedback = async (notes: string) => {
        const response = await fetch(`/api/review/pages/${page.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback_notes: notes }),
        })

        if (!response.ok) {
            toast.error('Failed to save feedback')
            throw new Error('Failed to save feedback')
        }

        // Update local parent state
        onChange(page.id, notes)
        toast.success('Feedback saved successfully')
    }

    // Handle accepting admin reply (resolves the feedback)
    const handleAcceptAdminReply = async () => {
        const response = await fetch(`/api/review/pages/${page.id}/accept-reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
            throw new Error('Failed to accept reply')
        }

        // Clear local feedback state since it's now resolved
        onChange(page.id, '')
    }

    // Handle customer follow-up (replaces feedback_notes, clears admin_reply)
    const handleCustomerFollowUp = async (notes: string) => {
        const response = await fetch(`/api/review/pages/${page.id}/follow-up`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback_notes: notes }),
        })

        if (!response.ok) {
            throw new Error('Failed to save follow-up')
        }

        // Update local state with new feedback
        onChange(page.id, notes)
    }

    return (
        <div className="w-full h-full">
            <SharedIllustrationBoard
                mode="customer"
                page={page}
                illustrationStatus={illustrationStatus}
                projectStatus={projectStatus}
                onSaveFeedback={handleSaveFeedback}
                illustrationSendCount={illustrationSendCount}
                onAcceptAdminReply={handleAcceptAdminReply}
                onCustomerFollowUp={handleCustomerFollowUp}
            />
        </div>
    )
})
