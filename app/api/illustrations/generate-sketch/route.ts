
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
        // Use strict fidelity prompt (restored from backup)
        const prompt = `Convert the illustration into a loose, natural pencil draft sketch with real pencil texture. 
Black and white only. Use rough graphite lines with visible grain, uneven pressure, slight wobble, and broken strokes. 
Include light construction lines, faint smudges, and subtle overlapping marks. 
No digital-looking smooth lines. No fills or gradients.

Preserve every character, pose, expression, and composition exactly, but make the linework look hand-drawn with a physical pencil on paper.

ABSOLUTE FIDELITY RULES — NO EXCEPTIONS:

1. Do NOT add, invent, or complete any element that does not exist in the original illustration. 
   Do NOT infer or reconstruct hidden or partially obscured body parts. 
   If something is not visible in the original image, it must NOT appear in the sketch. 
   No extra hands, limbs, fingers, objects, lines, shadows, or background details may be added. 
   Zero new visual information may be introduced.

2. Do NOT remove or omit any element from the original illustration. 
   Every visible detail in the source image must be present in the sketch. 
   Every contour, shape, object, background element, character detail, and texture must be fully represented. 
   Nothing may be skipped or simplified away.

3. The sketch must be a 1:1 structural replica of the original illustration. 
   Only the rendering style may change (from color to pencil). 
   All proportions, positions, shapes, silhouettes, overlaps, and compositions must remain identical.

The result must look like a faithful pencil-line tracing of the original image — only translated into a natural, hand-drawn pencil style, with no added or missing elements.`

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
        const { error: updateError } = await supabase.from('pages')
            .update({
                sketch_url: publicUrl,
                // sketch_generated_at is missing from DB schema
            })
            .eq('id', pageId)

        if (updateError) {
            console.error('Failed to update page with sketch URL:', updateError)
            throw new Error(`Database update failed: ${updateError.message}`)
        }

        console.log(`Sketch saved for Page ${page?.page_number}: ${publicUrl}`)

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
