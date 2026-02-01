import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// POST: Customer adds a follow-up reply (replaces feedback_notes, clears admin_reply)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()
        const { feedback_notes } = body

        if (!feedback_notes || !feedback_notes.trim()) {
            return NextResponse.json(
                { error: 'Follow-up text is required' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Get page to verify it exists
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, admin_reply')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        // Update page: replace feedback_notes, clear admin_reply
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                feedback_notes: feedback_notes.trim(),
                is_resolved: false,
                admin_reply: null,
                admin_reply_at: null
            })
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error saving follow-up:', updateError)
            return NextResponse.json(
                { error: 'Failed to save follow-up' },
                { status: 500 }
            )
        }

        // --- NOTIFICATION Trigger (same as regular feedback) ---
        try {
            const { data: projectDetails, error: projError } = await supabase
                .from('projects')
                .select('book_title, author_firstname, author_lastname')
                .eq('id', page.project_id)
                .single()

            if (!projError && projectDetails) {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
                const projectUrl = `${baseUrl}/admin/project/${page.project_id}?tab=illustrations`

                const { notifyCustomerReview } = await import('@/lib/notifications')

                const safeTitle = projectDetails.book_title || 'Untitled Project'
                const safeAuthor = `${projectDetails.author_firstname || ''} ${projectDetails.author_lastname || ''}`.trim() || 'Customer'

                // Non-blocking call
                notifyCustomerReview({
                    projectTitle: safeTitle,
                    authorName: safeAuthor,
                    pageNumber: updatedPage.page_number,
                    feedbackText: feedback_notes,
                    projectUrl
                }).catch(err => console.error('Notification error:', err))
            }
        } catch (notifyError: any) {
            console.error('Notification setup failed:', notifyError)
        }

        return NextResponse.json(updatedPage)
    } catch (error: any) {
        console.error('Error saving follow-up:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to save follow-up' },
            { status: 500 }
        )
    }
}
