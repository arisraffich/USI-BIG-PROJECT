import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

/**
 * Confirm Illustration Regeneration
 * 
 * Called after admin compares old vs new illustration and makes a decision.
 * - keep_new: Update DB with new URL, delete old file, return success for sketch generation
 * - revert_old: Delete new file from storage, keep DB unchanged
 */
export async function POST(request: Request) {
    try {
        const { 
            decision, 
            pageId, 
            projectId,
            oldUrl, 
            newUrl 
        } = await request.json() as {
            decision: 'keep_new' | 'revert_old'
            pageId: string
            projectId: string
            oldUrl: string
            newUrl: string
        }

        if (!decision || !pageId || !projectId || !newUrl) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        // Helper to extract storage path from URL
        const extractPath = (url: string): string | null => {
            const parts = url.split('/illustrations/')
            return parts.length > 1 ? parts[1] : null
        }

        if (decision === 'keep_new') {
            // Check if this page already has an original saved
            const { data: pageData } = await supabase.from('pages')
                .select('original_illustration_url')
                .eq('id', pageId)
                .single()
            
            const isFirstGeneration = !pageData?.original_illustration_url

            // 1. Update DB with new illustration URL
            await supabase.from('pages')
                .update({
                    illustration_url: newUrl,
                    is_resolved: true,
                    ...(isFirstGeneration ? { original_illustration_url: newUrl } : {}),
                })
                .eq('id', pageId)

            // 2. Delete old file from storage (if exists)
            if (oldUrl) {
                const oldPath = extractPath(oldUrl)
                if (oldPath) {
                    await supabase.storage
                        .from('illustrations')
                        .remove([oldPath])
                        .catch(err => console.warn('Failed to delete old illustration:', err))
                }
            }

            // 3. Update project status if needed
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
                decision: 'keep_new',
                illustrationUrl: newUrl,
                message: 'New illustration confirmed. Ready for sketch generation.'
            })

        } else if (decision === 'revert_old') {
            // Delete the new file from storage (it was never saved to DB)
            const newPath = extractPath(newUrl)
            if (newPath) {
                await supabase.storage
                    .from('illustrations')
                    .remove([newPath])
                    .catch(err => console.warn('Failed to delete new illustration:', err))
            }

            return NextResponse.json({
                success: true,
                decision: 'revert_old',
                message: 'Reverted to previous illustration.'
            })
        }

        return NextResponse.json(
            { error: 'Invalid decision' },
            { status: 400 }
        )

    } catch (error: unknown) {
        console.error('Illustration confirm error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to confirm illustration') },
            { status: 500 }
        )
    }
}
