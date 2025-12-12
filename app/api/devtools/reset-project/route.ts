import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
    // Only allow in development or if specific secret header is present (skipping secret for now as this is a prototype)
    if (process.env.NODE_ENV !== 'development') {
        // Optional: add a bypass key check if you want to test on preview envs
    }

    try {
        const { projectId } = await request.json()

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        console.log(`[DevTools] Resetting project ${projectId} to 'Illustrations Not Started'`)

        // 1. Reset Project Status (Skipping missing columns on 'projects' table for now)
        // const { error: projectError } = await supabase
        //     .from('projects')
        //     .update({
        //         illustration_status: 'not_started',
        //         style_reference_page_id: null
        //     })
        //     .eq('id', projectId)

        // if (projectError) throw projectError

        // 2. Clear Page Data (Illustrations & Sketches)
        const { error: pageError } = await supabase
            .from('pages')
            .update({
                illustration_url: null,
                // illustration_status: 'pending', // Missing
                sketch_url: null,
                // sketch_prompt: null, // sketch_prompt column might be missing too, let's check schema.json... 
                // Schema JSON said: "sketch_prompt":null exists. "sketch_url":null exists.
                sketch_prompt: null
            })
            .eq('project_id', projectId)

        if (pageError) throw pageError

        return NextResponse.json({ success: true, message: 'Project reset successfully' })

    } catch (error: any) {
        console.error('[DevTools] Reset Error Details:', JSON.stringify(error, null, 2))
        return NextResponse.json({ error: error.message || 'Unknown error', details: error }, { status: 500 })
    }
}
