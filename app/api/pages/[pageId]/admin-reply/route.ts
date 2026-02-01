import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// POST: Save admin reply to customer feedback
export async function POST(
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

        // Verify page exists and has feedback to reply to
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, feedback_notes, is_resolved')
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
                { error: 'No feedback to reply to' },
                { status: 400 }
            )
        }

        if (page.is_resolved) {
            return NextResponse.json(
                { error: 'Feedback is already resolved' },
                { status: 400 }
            )
        }

        // Save admin reply
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                admin_reply: admin_reply.trim(),
                admin_reply_at: new Date().toISOString()
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

// DELETE: Clear admin reply (if admin regenerates the image)
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
                admin_reply_at: null
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
