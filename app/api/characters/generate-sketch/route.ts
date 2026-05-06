import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'
import { SKETCH_PROMPT } from '@/lib/ai/sketch-prompt'

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

        console.log(`[Character Sketch] 🎨 Generating sketch for: ${character.name || character.role || characterId} (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed)`)

        // Generate Sketch
        const result = await generateSketch(imageUrl, SKETCH_PROMPT)

        console.log(`[Character Sketch] 📊 Generation result: success=${result.success}, hasBuffer=${!!result.imageBuffer}, error=${result.error || 'none'} (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed)`)

        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Failed to generate character sketch')
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
                sketch_prompt: SKETCH_PROMPT
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




