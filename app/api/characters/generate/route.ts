import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'

export async function POST(request: NextRequest) {
  try {
    const { project_id, character_id, custom_prompt } = await request.json()

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Get main character (required for reference)
    const { data: mainCharacter, error: mainCharError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project_id)
      .eq('is_main', true)
      .single()

    if (mainCharError || !mainCharacter || !mainCharacter.image_url) {
      return NextResponse.json(
        { error: 'Main character image is required for generation' },
        { status: 400 }
      )
    }

    // Get characters to generate
    let charactersToGenerate
    if (character_id) {
      // Generate single character
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('*')
        .eq('id', character_id)
        .eq('project_id', project_id)
        .single()

      if (charError || !character) {
        return NextResponse.json(
          { error: 'Character not found' },
          { status: 404 }
        )
      }

      if (character.is_main) {
        return NextResponse.json(
          { error: 'Cannot regenerate main character' },
          { status: 400 }
        )
      }

      charactersToGenerate = [character]
    } else {
      // Generate all secondary characters
      const { data: secondaryChars, error: secCharsError } = await supabase
        .from('characters')
        .select('*')
        .eq('project_id', project_id)
        .eq('is_main', false)

      if (secCharsError) {
        return NextResponse.json(
          { error: 'Failed to fetch characters' },
          { status: 500 }
        )
      }

      charactersToGenerate = secondaryChars || []
    }

    if (charactersToGenerate.length === 0) {
      return NextResponse.json(
        { error: 'No characters to generate' },
        { status: 400 }
      )
    }

    const results = []

    // Generate each character
    // Dynamically import to avoid top-level issues if any
    const { generateCharacterImage } = await import('@/lib/ai/character-generator')

    for (const character of charactersToGenerate) {
      try {
        // Pass custom_prompt only if generating a single character (implied by this loop structure if simple)
        // But logical safety: if bulk, we probably don't want same prompt for all.
        // But for single character (character_id present), custom_prompt is valid.
        // Use the character's own image as reference if it exists (for refinement/regeneration)
        // If not (first gen), use Main Character for style reference
        const referenceImage = character.image_url || mainCharacter.image_url

        const result = await generateCharacterImage(character, referenceImage, project_id, custom_prompt)

        results.push({
          character_id: character.id,
          success: result.success,
          image_url: result.imageUrl,
          error: result.error
        })

        // Trigger sketch generation asynchronously after successful colored generation
        if (result.success && result.imageUrl) {
          ;(async () => {
            try {
              const { generateSketch } = await import('@/lib/ai/google-ai')
              const { sanitizeFilename } = await import('@/lib/utils/metadata-cleaner')
              
              const prompt = `Convert the illustration into a loose, natural pencil draft sketch with real pencil texture. 
Black and white only. Use rough graphite lines with visible grain, uneven pressure, slight wobble, and broken strokes. 
Include light construction lines, faint smudges, and subtle overlapping marks. 
No digital-looking smooth lines. No fills or gradients.

Preserve every character, pose, expression, and composition exactly, but make the linework look hand-drawn with a physical pencil on paper.

ABSOLUTE FIDELITY RULES — NO EXCEPTIONS:

1. Do NOT add, invent, or complete any element that does not exist in the original illustration. 
2. Do NOT remove or omit any element from the original illustration. 
3. The sketch must be a 1:1 structural replica of the original illustration.`
              
              const sketchResult = await generateSketch(result.imageUrl, prompt)
              
              if (sketchResult.success && sketchResult.imageBuffer) {
                const timestamp = Date.now()
                const characterName = sanitizeFilename(character.name || character.role || 'character')
                const filename = `${project_id}/characters/${characterName}-sketch-${timestamp}.png`
                
                const { error: uploadError } = await supabase.storage
                  .from('character-sketches')
                  .upload(filename, sketchResult.imageBuffer, {
                    contentType: 'image/png',
                    upsert: true
                  })
                
                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from('character-sketches')
                    .getPublicUrl(filename)
                  
                  await supabase
                    .from('characters')
                    .update({
                      sketch_url: urlData.publicUrl,
                      sketch_prompt: prompt
                    })
                    .eq('id', character.id)
                  
                  console.log(`[Character Generation] ✅ Sketch generated for ${character.name || character.role}`)
                } else {
                  console.error(`[Character Generation] Sketch upload error for ${character.id}:`, uploadError)
                }
              }
            } catch (err) {
              console.error(`[Character Generation] Failed to generate sketch for ${character.id}:`, err)
            }
          })()
        }
      } catch (error: any) {
        // Should catch errors that escaped generateCharacterImage
        const errorMessage = error.message || 'Generation failed'
        console.error(`Error in loop for character ${character.id}:`, error)

        // Persist error to database so UI knows to stop loading
        try {
          await supabase
            .from('characters')
            .update({ generation_error: errorMessage })
            .eq('id', character.id)
        } catch (dbError) {
          console.error('Failed to save generation error to DB:', dbError)
        }

        results.push({
          character_id: character.id,
          success: false,
          error: errorMessage,
        })
      }
    }

    // Update project status if all succeeded
    const allSucceeded = results.every((r) => r.success)
    if (allSucceeded && results.length > 0) {
      // Determine appropriate status based on whether this is first generation or regeneration
      const { data: project } = await supabase
        .from('projects')
        .select('status, character_send_count')
        .eq('id', project_id)
        .single()

      if (project) {
        // Initial Generation Phase
        if (project.status === 'character_generation') {

          const { error: updateError } = await supabase
            .from('projects')
            .update({ status: 'character_generation_complete' })
            .eq('id', project_id)

          if (updateError) {
            console.error('Failed to update project status:', updateError)
          }
        } else {
          // Manual Regeneration / Revision Phase
          // Always update to 'characters_regenerated' to enable the "Resend" flow

          const { error: updateError } = await supabase
            .from('projects')
            .update({ status: 'characters_regenerated' })
            .eq('id', project_id)

          if (updateError) {
            console.error('Failed to update project status:', updateError)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      generated: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    })
  } catch (error: any) {
    console.error('Error generating character images:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate character images' },
      { status: 500 }
    )
  }
}















