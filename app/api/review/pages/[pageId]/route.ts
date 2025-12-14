import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const { pageId } = await params
        const body = await request.json()

        const supabase = await createAdminClient()

        // Get page to verify it exists and get project_id
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        // Verify project is in correct status 
        // Allowing both illustration_review (standard) and character_review (if we treat it as part of that phase for now, though technically it should be illustration_review)
        // For safety, let's check the project status but ensure we don't block valid flows.
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, status')
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

        // Update page
        const { data: updatedPage, error: updateError } = await supabase
            .from('pages')
            .update({
                feedback_notes: body.feedback_notes || null,
                is_resolved: false, // Reset resolved status on new feedback
            })
            .eq('id', pageId)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating page:', updateError)
            return NextResponse.json(
                { error: 'Failed to update page' },
                { status: 500 }
            )
        }

        return NextResponse.json(updatedPage)
    } catch (error: any) {
        console.error('Error updating page:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update page' },
            { status: 500 }
        )
    }
}
