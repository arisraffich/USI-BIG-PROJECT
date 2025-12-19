
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { buildSketchPrompt } from '@/lib/utils/prompt-builder'

// Allow max duration
export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const { projectId, pageId, illustrationUrl } = await request.json()

        if (!projectId || !illustrationUrl) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // 1. Fetch Page Data for Prompt Context
        // We need page data to build a good sketch prompt context if needed, 
        // though the visual conversion is primary.
        // We already have prompt-builder logic for this.
        // Fetch characters too?
        // Let's optimize: Just use a standard sketch conversion prompt + illustrationUrl.
        // But `buildSketchPrompt` from lib might expect page/project objects.
        // Let's fetch them to be safe and use the dedicated builder if useful.
        // Actually, `generateSketch` in google-ai.ts uses input image + prompt.
        // The visual input is the most important. The prompt guides the style.

        // Fetch Page & Project
        const { data: page } = await supabase.from('pages').select('*').eq('id', pageId).single()
        const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single()
        const { data: characters } = await supabase.from('characters').select('*').eq('project_id', projectId)

        // Use builder or fallback
        // Use strict fidelity prompt (optimized for speed)
        const prompt = `Convert this illustration into a natural pencil sketch with authentic graphite texture. Black and white only.

STYLE: Rough pencil lines with visible grain, uneven pressure, wobble, and broken strokes. Include construction lines, smudges, and overlapping marks. No smooth digital lines, fills, or gradients.

FIDELITY RULES (STRICT):
1. DO NOT add anything not visible in the original (no extra limbs, objects, details, or background elements)
2. DO NOT remove or omit any visible element (every contour, shape, and detail must be present)
3. Maintain exact 1:1 structural replica (only style changes from color to pencil)

Preserve all proportions, positions, poses, expressions, and compositions exactly. Result must be a faithful pencil tracing with hand-drawn texture—no additions, no omissions.`

        console.log(`Generating sketch for Page ${page?.page_number}...`)

        // 2. Generate Sketch
        const result = await generateSketch(illustrationUrl, prompt)

        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Failed to generate sketch')
        }

        // 3. Upload to Storage
        const timestamp = Date.now()
        const filename = `${projectId}/sketches/page-${page?.page_number || 'unknown'}-${timestamp}.png`

        const { error: uploadError } = await supabase.storage
            .from('sketches') // Ensure bucket exists
            .upload(filename, result.imageBuffer, {
                contentType: 'image/png',
                upsert: true
            })

        if (uploadError) throw new Error(`Sketch Upload Failed: ${uploadError.message} `)

        const { data: urlData } = supabase.storage.from('sketches').getPublicUrl(filename)
        const publicUrl = urlData.publicUrl

        // 4. Update Page Record
        await supabase.from('pages')
            .update({
                sketch_url: publicUrl,
                // sketch_generated_at is missing from DB schema
            })
            .eq('id', pageId)

        return NextResponse.json({
            success: true,
            sketchUrl: publicUrl
        })

    } catch (error: any) {
        console.error('Sketch Generation Error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        )
    }
}
