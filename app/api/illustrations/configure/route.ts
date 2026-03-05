import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { projectId, aspect_ratio, text_integration } = await request.json()

        if (!projectId || !aspect_ratio || !text_integration) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        const supabase = await createClient()

        const { data: project, error } = await supabase
            .from('projects')
            .update({
                illustration_aspect_ratio: aspect_ratio,
                illustration_text_integration: text_integration
            })
            .eq('id', projectId)
            .select()
            .single()

        if (error) {
            console.error('Failed to update project config:', error)
            return NextResponse.json(
                { error: 'Failed to update configuration' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true, project })
    } catch (error) {
        console.error('Error in illustration config route:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
