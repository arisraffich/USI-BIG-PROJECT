import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
    }

    try {
        const { projectId } = await request.json()

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        console.log(`[DevTools] Resetting project ${projectId} to 'Illustrations Not Started'`)

        // 1. Reset Project Status
        const { error: projectError } = await supabase
            .from('projects')
            .update({
                status: 'characters_approved', // Go back to "Ready for Illustration" stage
                illustration_send_count: 0,
                review_token: crypto.randomUUID().replace(/-/g, ''), // Invalidate existing customer URL by rotating it
                illustration_aspect_ratio: null,
                illustration_text_integration: null,
            })
            .eq('id', projectId)

        if (projectError) throw projectError

        // 2. Clear Page Data (Illustrations & Sketches)
        const { error: pageError } = await supabase
            .from('pages')
            .update({
                illustration_url: null,
                // illustration_status: 'pending', // Missing
                sketch_url: null,
                sketch_prompt: null,
                // Reset Feedback Data too
                feedback_notes: null,
                is_resolved: false,
                feedback_history: [] // or null depending on schema preference, [] is safer for array types
            })
            .eq('project_id', projectId)

        if (pageError) throw pageError

        return NextResponse.json({ success: true, message: 'Project reset successfully' })

    } catch (error: any) {
        console.error('[DevTools] Reset Error Details:', JSON.stringify(error, null, 2))
        return NextResponse.json({ error: error.message || 'Unknown error', details: error }, { status: 500 })
    }
}
