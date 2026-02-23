import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

// POST: Customer adds a follow-up reply to the conversation thread
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()
        const { feedback_notes: followUpText } = body

        if (!followUpText || !followUpText.trim()) {
            return NextResponse.json(
                { error: 'Follow-up text is required' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Get page with current state
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, page_number, admin_reply, admin_reply_at, conversation_thread')
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
                { error: 'No admin reply to respond to' },
                { status: 400 }
            )
        }

        // Build new conversation thread:
        // 1. Get existing thread (or empty array)
        // 2. Add the current admin reply to thread
        // 3. Add customer's follow-up to thread
        const currentThread = Array.isArray(page.conversation_thread) ? page.conversation_thread : []
        const newThread = [
            ...currentThread,
            { type: 'admin' as const, text: page.admin_reply, at: page.admin_reply_at || new Date().toISOString() },
            { type: 'customer' as const, text: followUpText.trim(), at: new Date().toISOString() }
        ]

        // Update page: add to thread, clear admin_reply (admin needs to respond)
        // Note: feedback_notes (original request) stays unchanged
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                conversation_thread: newThread,
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

        // Update project status when customer adds follow-up (sketches_review → sketches_revision)
        const { data: project } = await supabase
            .from('projects')
            .select('status')
            .eq('id', page.project_id)
            .single()

        if (project?.status === 'sketches_review') {
            console.log(`[Follow-up] Transitioning project ${page.project_id} from sketches_review → sketches_revision`)
            await supabase
                .from('projects')
                .update({ status: 'sketches_revision' })
                .eq('id', page.project_id)
                .eq('status', 'sketches_review')
        }

        // --- NOTIFICATION Trigger (follow-up specific) ---
        try {
            const { data: projectDetails, error: projError } = await supabase
                .from('projects')
                .select('id, book_title, author_firstname, author_lastname')
                .eq('id', page.project_id)
                .single()

            if (!projError && projectDetails) {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
                const projectUrl = `${baseUrl}/admin/project/${projectDetails.id}?tab=illustrations`
                const authorName = `${projectDetails.author_firstname || ''} ${projectDetails.author_lastname || ''}`.trim() || 'Customer'

                const { notifyCustomerFollowUp } = await import('@/lib/notifications')

                // Non-blocking call
                notifyCustomerFollowUp({
                    projectTitle: projectDetails.book_title || 'Untitled Project',
                    authorName,
                    pageNumber: page.page_number,
                    followUpText: followUpText.trim(),
                    projectUrl
                }).catch(err => console.error('Notification error:', err))
            }
        } catch (notifyError: unknown) {
            console.error('Notification setup failed:', notifyError)
        }

        return NextResponse.json(updatedPage)
    } catch (error: unknown) {
        console.error('Error saving follow-up:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to save follow-up') },
            { status: 500 }
        )
    }
}

// PUT: Customer edits their last follow-up (only if admin hasn't responded)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()
        const { feedback_notes: newText } = body

        if (!newText || !newText.trim()) {
            return NextResponse.json(
                { error: 'Follow-up text is required' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Get page with current state
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, admin_reply, conversation_thread')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        // Check that admin hasn't responded yet
        if (page.admin_reply) {
            return NextResponse.json(
                { error: 'Cannot edit follow-up after admin has responded' },
                { status: 400 }
            )
        }

        // Check that the last message in thread is from customer
        const thread = Array.isArray(page.conversation_thread) ? page.conversation_thread : []
        if (thread.length === 0) {
            return NextResponse.json(
                { error: 'No follow-up to edit' },
                { status: 400 }
            )
        }

        const lastMessage = thread[thread.length - 1]
        if (lastMessage.type !== 'customer') {
            return NextResponse.json(
                { error: 'Can only edit your own messages' },
                { status: 400 }
            )
        }

        // Update the last message in the thread
        const updatedThread = [
            ...thread.slice(0, -1),
            { ...lastMessage, text: newText.trim() }
        ]

        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                conversation_thread: updatedThread
            })
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error editing follow-up:', updateError)
            return NextResponse.json(
                { error: 'Failed to edit follow-up' },
                { status: 500 }
            )
        }

        return NextResponse.json(updatedPage)
    } catch (error: unknown) {
        console.error('Error editing follow-up:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to edit follow-up') },
            { status: 500 }
        )
    }
}
