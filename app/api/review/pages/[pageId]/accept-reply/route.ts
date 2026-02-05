import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

// POST: Customer accepts the admin reply - resolves the feedback
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params

        const supabase = await createAdminClient()

        // Get page with current feedback
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, page_number, feedback_notes, feedback_history, admin_reply, is_resolved, conversation_thread')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        if (!page.admin_reply) {
            return NextResponse.json(
                { error: 'No admin reply to accept' },
                { status: 400 }
            )
        }

        // Get project details for revision_round and notification
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, illustration_send_count, book_title, author_firstname, author_lastname')
            .eq('id', page.project_id)
            .single()

        if (projectError || !project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            )
        }

        // Build conversation thread for history (include final admin reply)
        const conversationThread = Array.isArray(page.conversation_thread) ? page.conversation_thread : []
        // Add the final admin reply to the thread for history
        const finalThread = [
            ...conversationThread,
            { type: 'admin' as const, text: page.admin_reply, at: new Date().toISOString() }
        ]

        // Move feedback to history with conversation thread
        const currentHistory = Array.isArray(page.feedback_history) ? page.feedback_history : []
        const currentRound = (project.illustration_send_count || 0)
        
        const newHistory = [
            ...currentHistory,
            {
                note: page.feedback_notes,
                created_at: new Date().toISOString(),
                revision_round: currentRound,
                conversation_thread: finalThread.length > 1 ? finalThread : undefined // Only save if there was conversation
            }
        ]

        // Update page: resolve feedback, clear admin_reply and conversation_thread
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                feedback_notes: null,
                feedback_history: newHistory,
                is_resolved: true,
                admin_reply: null,
                admin_reply_at: null,
                conversation_thread: null
            })
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error accepting reply:', updateError)
            return NextResponse.json(
                { error: 'Failed to accept reply' },
                { status: 500 }
            )
        }

        // Send Slack notification (non-blocking)
        try {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
            const projectUrl = `${baseUrl}/admin/project/${project.id}?tab=illustrations`
            const authorName = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer'

            const { notifyCustomerAcceptedReply } = await import('@/lib/notifications')
            notifyCustomerAcceptedReply({
                projectTitle: project.book_title || 'Untitled Project',
                authorName,
                pageNumber: page.page_number,
                projectUrl
            }).catch(err => console.error('Notification error:', err))
        } catch (notifyError) {
            console.error('Notification setup failed:', notifyError)
        }

        return NextResponse.json(updatedPage)
    } catch (error: unknown) {
        console.error('Error accepting reply:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to accept reply') },
            { status: 500 }
        )
    }
}
