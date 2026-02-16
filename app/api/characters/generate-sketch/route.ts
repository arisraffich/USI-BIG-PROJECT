import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'

// Allow max duration
export const maxDuration = 60

export async function POST(request: Request) {
    const startTime = Date.now()
    let characterId: string | undefined
    
    try {
        const body = await request.json()
        characterId = body.characterId
        const imageUrl = body.imageUrl

        console.log(`[Character Sketch] 📥 Request received - characterId: ${characterId}, imageUrl: ${imageUrl?.substring(0, 80)}...`)

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
            console.error(`[Character Sketch] Character not found: ${characterId}`, charError)
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

        console.log(`[Character Sketch] 🎨 Generating sketch for: ${character.name || character.role || characterId} (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed)`)

        // Generate Sketch
        const result = await generateSketch(imageUrl, prompt)

        console.log(`[Character Sketch] 📊 Generation result: success=${result.success}, hasBuffer=${!!result.imageBuffer}, error=${result.error || 'none'} (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed)`)

        if (!result.success || !result.imageBuffer) {
            const errorMsg = result.error || 'Failed to generate character sketch'
            // Save error to DB so we can track it
            await supabase
                .from('characters')
                .update({ sketch_url: `error:${errorMsg}` })
                .eq('id', characterId)
            throw new Error(errorMsg)
        }

        // Upload to Storage
        const timestamp = Date.now()
        const characterName = sanitizeFilename(character.name || character.role || 'character')
        const filename = `${character.project_id}/characters/${characterName}-sketch-${timestamp}.png`

        console.log(`[Character Sketch] 📤 Uploading sketch: ${filename} (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed)`)

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

        console.log(`[Character Sketch] ✅ Sketch generated successfully for: ${character.name || character.role} (${((Date.now() - startTime) / 1000).toFixed(1)}s total)`)

        return NextResponse.json({
            success: true,
            sketchUrl: publicUrl
        })

    } catch (error: unknown) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const errorMsg = getErrorMessage(error, 'Internal Server Error')
        console.error(`[Character Sketch] ❌ Generation Error (${elapsed}s): ${errorMsg}`, error)
        
        // Save error to DB for debugging
        if (characterId) {
            try {
                const supabase = await createAdminClient()
                await supabase
                    .from('characters')
                    .update({ sketch_url: `error:${errorMsg}` })
                    .eq('id', characterId)
            } catch (dbErr) {
                console.error('[Character Sketch] Failed to save error to DB:', dbErr)
            }
        }
        
        return NextResponse.json(
            { error: errorMsg },
            { status: 500 }
        )
    }
}





