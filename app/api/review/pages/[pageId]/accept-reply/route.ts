import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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
            .select('id, project_id, feedback_notes, feedback_history, admin_reply, is_resolved')
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

        // Move feedback to history (same pattern as when admin sends/regenerates)
        const currentHistory = Array.isArray(page.feedback_history) ? page.feedback_history : []
        const currentRound = (project.illustration_send_count || 0)
        
        const newHistory = [
            ...currentHistory,
            {
                note: page.feedback_notes,
                created_at: new Date().toISOString(),
                revision_round: currentRound // Resolved in current round
            }
        ]

        // Update page: resolve feedback, clear admin_reply
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                feedback_notes: null,
                feedback_history: newHistory,
                is_resolved: true,
                admin_reply: null,
                admin_reply_at: null
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

        return NextResponse.json(updatedPage)
    } catch (error: any) {
        console.error('Error accepting reply:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to accept reply' },
            { status: 500 }
        )
    }
}
