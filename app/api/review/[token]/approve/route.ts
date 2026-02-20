import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCharactersApproved } from '@/lib/notifications'
import { getErrorMessage } from '@/lib/utils/error'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        if (!token) {
            return NextResponse.json(
                { error: 'Review token is required' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Get project by token
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, status, book_title, author_firstname, author_lastname')
            .eq('review_token', token)
            .single()

        if (projectError || !project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            )
        }

        if (project.status === 'characters_approved') {
            return NextResponse.json({ success: true, message: 'Already approved' })
        }

        // Only allow approval from states where characters have been reviewed
        const allowedStatuses = ['character_generation_complete', 'character_review', 'character_revision_needed']
        if (!allowedStatuses.includes(project.status)) {
            console.error(`[Approve] Rejected: project ${project.id} status is "${project.status}", not in allowed list`)
            return NextResponse.json(
                { error: 'Project is not in a state that allows character approval' },
                { status: 403 }
            )
        }

        // Optimistic lock: only update if status hasn't changed since we read it
        const { data: updated, error: updateError } = await supabase
            .from('projects')
            .update({ status: 'characters_approved' })
            .eq('id', project.id)
            .eq('status', project.status)
            .select('id')

        if (updateError || !updated?.length) {
            if (updateError) {
                console.error('[Approve] DB error:', updateError)
                return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 })
            }
            console.error('[Approve] Status race detected — status changed between read and write')
            return NextResponse.json({ error: 'Status changed, please refresh and try again' }, { status: 409 })
        }

        // Notify Slack
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const projectUrl = `${baseUrl}/admin/project/${project.id}`
        const authorName = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Author'

        // Fire and forget notification
        notifyCharactersApproved({
            projectId: project.id,
            projectTitle: project.book_title || 'Untitled',
            authorName,
            projectUrl
        }).catch(err => console.error('Notification failed', err))

        return NextResponse.json({
            success: true,
            message: 'Characters approved successfully'
        })

    } catch (error: unknown) {
        console.error('Error in approve route:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Internal server error') },
            { status: 500 }
        )
    }
}
