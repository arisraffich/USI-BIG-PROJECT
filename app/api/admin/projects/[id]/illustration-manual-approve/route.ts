import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCustomerSubmission } from '@/lib/notifications'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // 1. Validate Project Exists
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, book_title, author_firstname, author_lastname, status')
            .eq('id', projectId)
            .single()

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // 2. Resolve Pending Feedback (Implicit Approval)
        // We clear any pending notes on pages to ensure clean slate for next stage
        const { data: pages } = await supabase
            .from('pages')
            .select('id, feedback_notes, is_resolved, feedback_history')
            .eq('project_id', projectId)

        if (pages) {
            for (const p of pages) {
                if (p.feedback_notes && !p.is_resolved) {
                    const newHistoryItem = {
                        note: p.feedback_notes,
                        date: new Date().toISOString(),
                        status: 'resolved_by_admin_override',
                        source: 'admin'
                    }
                    const currentHistory = Array.isArray(p.feedback_history) ? p.feedback_history : []

                    await supabase.from('pages').update({
                        feedback_notes: null,
                        is_resolved: true,
                        feedback_history: [...currentHistory, newHistoryItem]
                    }).eq('id', p.id)
                }
            }
        }

        // 3. Update Status to Approved
        const newStatus = 'trial_approved' // Manual approve = trial approved
        await supabase.from('projects').update({
            status: newStatus
        }).eq('id', project.id)

        // 4. Notify Team (Slack Only)
        await notifyCustomerSubmission({
            projectId: project.id,
            projectTitle: project.book_title,
            authorName: `${project.author_firstname || ''} ${project.author_lastname || ''} (MANUAL ADMIN ILLUSTRATION APPROVAL)`.trim(),
            projectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/project/${project.id}`,
        })

        return NextResponse.json({
            success: true,
            message: 'Illustration trial manually approved. Next pages unlocked.',
            status: newStatus
        })

    } catch (error: any) {
        console.error('Manual Illustration Approve Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
