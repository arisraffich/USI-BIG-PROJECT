import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// POST: Save admin reply (to unresolved feedback) or comment (to resolved feedback)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()
        const { admin_reply, type = 'reply' } = body // type: 'reply' | 'comment'

        if (!admin_reply || !admin_reply.trim()) {
            return NextResponse.json(
                { error: 'Reply text is required' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Verify page exists
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, feedback_notes, is_resolved, admin_reply')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        // Validation based on type
        if (type === 'reply') {
            // Reply requires unresolved feedback
            if (!page.feedback_notes) {
                return NextResponse.json(
                    { error: 'No feedback to reply to' },
                    { status: 400 }
                )
            }
            if (page.is_resolved) {
                return NextResponse.json(
                    { error: 'Feedback is already resolved. Use comment instead.' },
                    { status: 400 }
                )
            }
        } else if (type === 'comment') {
            // Comment requires resolved feedback (or at least has history)
            if (!page.is_resolved) {
                return NextResponse.json(
                    { error: 'Cannot add comment to unresolved feedback. Use reply instead.' },
                    { status: 400 }
                )
            }
            if (page.admin_reply) {
                return NextResponse.json(
                    { error: 'A comment already exists. Remove it first to add a new one.' },
                    { status: 400 }
                )
            }
        }

        // Save admin reply/comment
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                admin_reply: admin_reply.trim(),
                admin_reply_at: new Date().toISOString(),
                admin_reply_type: type
            })
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error saving admin reply:', updateError)
            return NextResponse.json(
                { error: 'Failed to save reply' },
                { status: 500 }
            )
        }

        return NextResponse.json(updatedPage)
    } catch (error: any) {
        console.error('Error saving admin reply:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to save reply' },
            { status: 500 }
        )
    }
}

// PUT: Edit existing admin reply (only if customer hasn't followed up)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()
        const { admin_reply } = body

        if (!admin_reply || !admin_reply.trim()) {
            return NextResponse.json(
                { error: 'Reply text is required' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Get current page state
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, admin_reply, admin_reply_type, conversation_thread')
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
                { error: 'No reply to edit' },
                { status: 400 }
            )
        }

        // For replies (not comments), check if customer has followed up
        if (page.admin_reply_type === 'reply' || !page.admin_reply_type) {
            const thread = Array.isArray(page.conversation_thread) ? page.conversation_thread : []
            const lastMessage = thread.length > 0 ? thread[thread.length - 1] : null
            
            // If last message in thread is from customer, admin can't edit their reply
            if (lastMessage && lastMessage.type === 'customer') {
                return NextResponse.json(
                    { error: 'Cannot edit reply after customer has followed up' },
                    { status: 400 }
                )
            }
        }

        // Update the reply text (keep same type and timestamp)
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                admin_reply: admin_reply.trim()
            })
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error editing admin reply:', updateError)
            return NextResponse.json(
                { error: 'Failed to edit reply' },
                { status: 500 }
            )
        }

        return NextResponse.json(updatedPage)
    } catch (error: any) {
        console.error('Error editing admin reply:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to edit reply' },
            { status: 500 }
        )
    }
}

// DELETE: Clear admin reply/comment
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params

        const supabase = await createAdminClient()

        const { error: updateError } = await supabase
            .from('pages')
            .update({
                admin_reply: null,
                admin_reply_at: null,
                admin_reply_type: null
            })
            .eq('id', pageId)

        if (updateError) {
            console.error('Error clearing admin reply:', updateError)
            return NextResponse.json(
                { error: 'Failed to clear reply' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error clearing admin reply:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to clear reply' },
            { status: 500 }
        )
    }
}
