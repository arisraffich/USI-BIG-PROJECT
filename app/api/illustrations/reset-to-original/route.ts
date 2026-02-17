import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

/**
 * Reset illustration to its original (first-ever) version.
 * Restores original_illustration_url → illustration_url without any AI call.
 */
export async function POST(request: Request) {
    try {
        const { pageId, projectId } = await request.json() as {
            pageId: string
            projectId: string
        }

        if (!pageId || !projectId) {
            return NextResponse.json(
                { error: 'Missing pageId or projectId' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Fetch the page to get original URL
        const { data: page, error: fetchError } = await supabase
            .from('pages')
            .select('illustration_url, original_illustration_url')
            .eq('id', pageId)
            .eq('project_id', projectId)
            .single()

        if (fetchError || !page) {
            return NextResponse.json(
                { error: 'Page not found' },
                { status: 404 }
            )
        }

        if (!page.original_illustration_url) {
            return NextResponse.json(
                { error: 'No original illustration saved for this page' },
                { status: 400 }
            )
        }

        if (page.illustration_url === page.original_illustration_url) {
            return NextResponse.json({
                success: true,
                illustrationUrl: page.original_illustration_url,
                message: 'Already showing original illustration'
            })
        }

        // Restore original
        await supabase.from('pages')
            .update({
                illustration_url: page.original_illustration_url,
                is_resolved: true,
            })
            .eq('id', pageId)

        // Update project status if needed
        const { data: project } = await supabase
            .from('projects')
            .select('illustration_send_count, status')
            .eq('id', projectId)
            .single()

        const sendCount = project?.illustration_send_count || 0
        const currentStatus = project?.status

        if (sendCount > 0 && currentStatus !== 'illustration_approved') {
            await supabase.from('projects')
                .update({ status: 'illustration_revision_needed' })
                .eq('id', projectId)
        }

        return NextResponse.json({
            success: true,
            illustrationUrl: page.original_illustration_url,
            message: 'Restored to original illustration'
        })

    } catch (error: unknown) {
        console.error('Reset to original error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to reset illustration') },
            { status: 500 }
        )
    }
}
