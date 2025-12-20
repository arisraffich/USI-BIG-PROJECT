import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'

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

        // Use the exact same prompt as page illustration sketches (optimized for speed)
        const prompt = `Convert this illustration into a natural pencil sketch with authentic graphite texture. Black and white only.

STYLE: Rough pencil lines with visible grain, uneven pressure, wobble, and broken strokes. Include construction lines, smudges, and overlapping marks. No smooth digital lines, fills, or gradients.

FIDELITY RULES (STRICT):
1. DO NOT add anything not visible in the original (no extra limbs, objects, details, or background elements)
2. DO NOT remove or omit any visible element (every contour, shape, and detail must be present)
3. Maintain exact 1:1 structural replica (only style changes from color to pencil)

Preserve all proportions, positions, poses, expressions, and compositions exactly. Result must be a faithful pencil tracing with hand-drawn texture—no additions, no omissions.`

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

    } catch (error: any) {
        console.error('[Character Sketch] Generation Error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        )
    }
}


