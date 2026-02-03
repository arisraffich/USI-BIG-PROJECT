import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// POST: Admin manually resolves a revision without regeneration
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params

        const supabase = await createAdminClient()

        // Get page with current state
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, feedback_notes, feedback_history, admin_reply, admin_reply_at, admin_reply_type, conversation_thread, is_resolved')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        if (!page.feedback_notes) {
            return NextResponse.json(
                { error: 'No feedback to resolve' },
                { status: 400 }
            )
        }

        if (page.is_resolved) {
            return NextResponse.json(
                { error: 'Feedback is already resolved' },
                { status: 400 }
            )
        }

        // Get project's current illustration_send_count for revision_round
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('illustration_send_count')
            .eq('id', page.project_id)
            .single()

        if (projectError || !project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            )
        }

        // Build conversation thread for history (include admin reply if exists)
        const conversationThread = Array.isArray(page.conversation_thread) ? page.conversation_thread : []
        let finalThread = [...conversationThread]
        
        // If there's a current admin_reply, add it to the thread for history
        if (page.admin_reply) {
            finalThread = [
                ...finalThread,
                { type: 'admin' as const, text: page.admin_reply, at: page.admin_reply_at || new Date().toISOString() }
            ]
        }

        // Move feedback to history with conversation thread
        const currentHistory = Array.isArray(page.feedback_history) ? page.feedback_history : []
        const currentRound = (project.illustration_send_count || 0)
        
        const newHistory = [
            ...currentHistory,
            {
                note: page.feedback_notes,
                created_at: new Date().toISOString(),
                revision_round: currentRound,
                conversation_thread: finalThread.length > 0 ? finalThread : undefined
            }
        ]

        // Prepare update data
        const updateData: any = {
            feedback_notes: null,
            feedback_history: newHistory,
            is_resolved: true,
            conversation_thread: null
        }

        // If admin_reply exists, convert it to a comment (informational note on resolved)
        if (page.admin_reply) {
            updateData.admin_reply_type = 'comment'
            // Keep admin_reply and admin_reply_at as is
        } else {
            // Clear any reply data
            updateData.admin_reply = null
            updateData.admin_reply_at = null
            updateData.admin_reply_type = null
        }

        // Update page
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update(updateData)
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error resolving feedback:', updateError)
            return NextResponse.json(
                { error: 'Failed to resolve feedback' },
                { status: 500 }
            )
        }

        return NextResponse.json(updatedPage)
    } catch (error: any) {
        console.error('Error resolving feedback:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to resolve feedback' },
            { status: 500 }
        )
    }
}
