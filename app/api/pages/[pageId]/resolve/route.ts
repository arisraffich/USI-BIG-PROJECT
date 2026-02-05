import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

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

        // Prepare update data based on whether admin has a reply
        let updateData: any = {
            is_resolved: true,
            conversation_thread: null
        }

        if (page.admin_reply) {
            // If admin has a reply, convert it to a comment and KEEP feedback_notes visible
            // This way the resolved revision shows with the comment below it
            updateData.admin_reply_type = 'comment'
            // Keep feedback_notes as is (visible as "RESOLVED:")
            // Keep admin_reply as is (visible as "ILLUSTRATOR NOTE:")
            
            // Archive conversation_thread to history if exists (but not feedback_notes)
            if (page.conversation_thread && page.conversation_thread.length > 0) {
                const currentHistory = Array.isArray(page.feedback_history) ? page.feedback_history : []
                const currentRound = (project.illustration_send_count || 0)
                updateData.feedback_history = [
                    ...currentHistory,
                    {
                        note: `[Conversation archived]`,
                        created_at: new Date().toISOString(),
                        revision_round: currentRound,
                        conversation_thread: page.conversation_thread
                    }
                ]
            }
        } else {
            // No admin reply - move feedback to history as normal
            const conversationThread = Array.isArray(page.conversation_thread) ? page.conversation_thread : []
            const currentHistory = Array.isArray(page.feedback_history) ? page.feedback_history : []
            const currentRound = (project.illustration_send_count || 0)
            
            updateData.feedback_notes = null
            updateData.feedback_history = [
                ...currentHistory,
                {
                    note: page.feedback_notes,
                    created_at: new Date().toISOString(),
                    revision_round: currentRound,
                    conversation_thread: conversationThread.length > 0 ? conversationThread : undefined
                }
            ]
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
    } catch (error: unknown) {
        console.error('Error resolving feedback:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to resolve feedback') },
            { status: 500 }
        )
    }
}
