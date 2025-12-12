import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { analyzeScene } from '@/lib/ai/director'

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

        // Update project configuration
        const { data: project, error } = await supabase
            .from('projects')
            .update({
                illustration_aspect_ratio: aspect_ratio,
                illustration_text_integration: text_integration,
                illustration_status: 'analyzing' // Start AI Director analysis
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

        // 2. Trigger AI Director Analysis (Synchronously or Background)
        // We need to fetch Page 1 data and Characters first

        // Fetch Page 1
        const { data: page1 } = await supabase
            .from('pages')
            .select('id, story_text, scene_description')
            .eq('project_id', projectId)
            .eq('page_number', 1)
            .single()

        // Fetch Characters
        const { data: characters } = await supabase
            .from('characters')
            .select('*')
            .eq('project_id', projectId)

        if (page1 && characters) {
            // Run analysis. We await it to ensure it starts/completes before client polls.
            try {
                // Determine implicit description if missing
                const desc = page1.scene_description || 'A scene from the story.'

                await analyzeScene(
                    projectId,
                    page1.id,
                    page1.story_text || '',
                    desc,
                    characters
                )
            } catch (analysisError) {
                console.error('AI Director Analysis Failed:', analysisError)
                // We don't fail the config save, but we should probably log it.
            }
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
