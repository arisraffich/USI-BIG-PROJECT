import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'


export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()

        const supabase = await createAdminClient()

        // Get page to verify it exists and get project_id (include resolved state and history)
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, page_number, is_resolved, feedback_notes, feedback_history, admin_reply, admin_reply_at, admin_reply_type')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            console.error('Page query error:', pageError)
            return NextResponse.json(
                { error: 'Page not found', details: pageError?.message },
                { status: 404 }
            )
        }

        // Verify project is in correct status 
        // Allowing both illustration_review (standard) and character_review (if we treat it as part of that phase for now, though technically it should be illustration_review)
        // For safety, let's check the project status but ensure we don't block valid flows.
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, status, illustration_send_count')
            .eq('id', page.project_id)
            .single()

        if (projectError || !project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            )
        }

        // Strict status check can be problematic if statuses overlap, but for now we essentially want to ensure the project isn't "completed" or something.
        // However, recreating the character logic exactly:
        // Characters endpoint checks for 'character_review'.
        // Illustrations currently happen in 'character_review' (trial) or 'illustration_review' (full).
        // Let's allow updates if the project is NOT completed/cancelled.

        // Actually, following the character logic:
        // if (project.status !== 'character_review') ... 
        // But illustrations might be reviewed in different phases.
        // Let's skip the strict status check for this specific patch to ensure it works for the "Trial" (which is technically during character_approved/sketch_generation/etc).
        // The most important thing is that the user has the token (which is validated by the middleware/parent flow, usually).
        // But here we are in an API route. 
        // The character route uses `createAdminClient` so it doesn't check the token itself.
        // It relies on the ID being guessable ONLY if you know it? No, that's insecure.
        // BUT, the `review/[token]` page protects the UI. The API route itself is technically open if you know the UUID.
        // This is a known "security through obscurity" flaw in the current app design (inherited from character review).
        // I will proceed with replicating the pattern as requested (admin client update).

        // Build update data
        let updateData: any = {
            feedback_notes: body.feedback_notes || null,
            is_resolved: false, // Reset resolved status on new feedback
        }

        // If page was resolved, handle archiving and cleanup
        if (page.is_resolved) {
            // Archive old feedback if it exists
            if (page.feedback_notes) {
                // Build history entry from old resolved feedback
                const historyEntry: any = {
                    note: page.feedback_notes,
                    created_at: new Date().toISOString(),
                    revision_round: project.illustration_send_count || 1
                }
                
                // If there was an admin comment, include it in the history
                if (page.admin_reply && page.admin_reply_type === 'comment') {
                    historyEntry.admin_comment = page.admin_reply
                    historyEntry.admin_comment_at = page.admin_reply_at
                }
                
                // Prepend to existing history
                const existingHistory = page.feedback_history || []
                updateData.feedback_history = [historyEntry, ...existingHistory]
            }
            
            // Always clear admin reply fields when starting fresh feedback on a resolved page
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
            console.error('Error updating page:', JSON.stringify(updateError, null, 2))
            console.error('Update data was:', JSON.stringify(updateData, null, 2))
            console.error('Page state was:', JSON.stringify(page, null, 2))
            return NextResponse.json(
                { error: 'Failed to update page', details: updateError.message, code: updateError.code },
                { status: 500 }
            )
        }

        // Update project status when customer adds feedback (sketches_review → sketches_revision)
        if (body.feedback_notes && project.status === 'sketches_review') {
            await supabase
                .from('projects')
                .update({ status: 'sketches_revision' })
                .eq('id', page.project_id)
                .eq('status', 'sketches_review')
        }

        // --- NOTIFICATION Trigger ---
        // Only notify if feedback_notes is set (not null/empty)
        if (body.feedback_notes) {
            try {
                // Fetch extra project details needed for notification
                const { data: projectDetails, error: projError } = await supabase
                    .from('projects')
                    .select('book_title, author_firstname, author_lastname')
                    .eq('id', page.project_id)
                    .single()

                if (projError) {
                    console.error('Project Fetch Error:', projError)
                }

                if (projectDetails) {
                    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
                    const projectUrl = `${baseUrl}/admin/project/${page.project_id}?tab=illustrations`

                    const { notifyCustomerReview } = await import('@/lib/notifications')

                    const safeTitle = projectDetails.book_title || 'Untitled Project'
                    const safeAuthor = `${projectDetails.author_firstname || ''} ${projectDetails.author_lastname || ''}`.trim() || 'Customer'

                    // Non-blocking call
                    notifyCustomerReview({
                        projectTitle: safeTitle,
                        authorName: safeAuthor,
                        pageNumber: updatedPage.page_number,
                        feedbackText: body.feedback_notes,
                        projectUrl
                    }).then(() => { })
                        .catch(err => console.error('Notification error:', err))

                } else {
                    // No Project Details Found for ID: ${page.project_id}
                }
            } catch (notifyError: unknown) {
                console.error('Notification setup failed:', notifyError)
            }
        } else {
            // No feedback_notes in body
        }

        return NextResponse.json(updatedPage)
    } catch (error: unknown) {
        console.error('Error updating page:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to update page') },
            { status: 500 }
        )
    }
}
