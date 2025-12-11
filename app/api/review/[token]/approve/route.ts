import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCharactersApproved } from '@/lib/notifications'

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

        // Verify status allows approval
        // Allowed: character_review, characters_regenerated
        // Blocked: character_generation, character_generation_complete, characters_approved (idempotent OK but nice to know)
        if (project.status === 'characters_approved') {
            return NextResponse.json({ success: true, message: 'Already approved' })
        }

        // Update status
        const { error: updateError } = await supabase
            .from('projects')
            .update({
                status: 'characters_approved',
                // We might want to clear any pending flags if needed, but for now just status
            })
            .eq('id', project.id)

        if (updateError) {
            console.error('Error approving characters:', updateError)
            return NextResponse.json(
                { error: 'Failed to update project status' },
                { status: 500 }
            )
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

    } catch (error: any) {
        console.error('Error in approve route:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
