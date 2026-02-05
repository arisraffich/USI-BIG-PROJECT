import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'

// Allow max duration
export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const { characterId, imageUrl } = await request.json()

        if (!characterId || !imageUrl) {
            return NextResponse.json({ 
                error: 'Missing required parameters: characterId and imageUrl' 
            }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // Fetch character data
        const { data: character, error: charError } = await supabase
            .from('characters')
            .select('*')
            .eq('id', characterId)
            .single()

        if (charError || !character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 })
        }

        // Use the exact same prompt as page illustration sketches (restored from backup)
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

        console.log(`[Character Sketch] Generating sketch for character: ${character.name || character.role || characterId}`)

        // Generate Sketch
        const result = await generateSketch(imageUrl, prompt)

        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Failed to generate character sketch')
        }

        // Upload to Storage
        const timestamp = Date.now()
        const characterName = sanitizeFilename(character.name || character.role || 'character')
        const filename = `${character.project_id}/characters/${characterName}-sketch-${timestamp}.png`

        const { error: uploadError } = await supabase.storage
            .from('character-sketches')
            .upload(filename, result.imageBuffer, {
                contentType: 'image/png',
                upsert: true
            })

        if (uploadError) {
            throw new Error(`Character Sketch Upload Failed: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
            .from('character-sketches')
            .getPublicUrl(filename)
        
        const publicUrl = urlData.publicUrl

        // Update Character Record
        await supabase
            .from('characters')
            .update({
                sketch_url: publicUrl,
                sketch_prompt: prompt
            })
            .eq('id', characterId)

        console.log(`[Character Sketch] ✅ Sketch generated successfully for: ${character.name || character.role}`)

        return NextResponse.json({
            success: true,
            sketchUrl: publicUrl
        })

    } catch (error: unknown) {
        console.error('[Character Sketch] Generation Error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Internal Server Error') },
            { status: 500 }
        )
    }
}





