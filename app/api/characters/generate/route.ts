import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'

export async function POST(request: NextRequest) {
  try {
    const { project_id, character_id, custom_prompt, visual_reference_image } = await request.json()

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

    console.log(`[Character Generate] 🎨 Starting generation for ${charactersToGenerate.length} character(s)`)
    
    for (const character of charactersToGenerate) {
      console.log(`[Character Generate] Processing: ${character.name || character.role || character.id}`)
      try {
        // Clear sketch_url for regeneration (if character already has valid images)
        // This ensures the loading spinner appears on the sketch card during regeneration
        const hasValidImage = character.image_url && !character.image_url.startsWith('error:')
        const hasValidSketch = character.sketch_url && !character.sketch_url.startsWith('error:')
        if (hasValidImage && hasValidSketch) {
          console.log(`[Character Generate] 🧹 Clearing old sketch_url for regeneration: ${character.name || character.role}`)
          await supabase
            .from('characters')
            .update({ sketch_url: null })
            .eq('id', character.id)
        }

        // Pass custom_prompt only if generating a single character (implied by this loop structure if simple)
        // But logical safety: if bulk, we probably don't want same prompt for all.
        // But for single character (character_id present), custom_prompt is valid.
        // Use character's image as reference, but skip if it's an error state
        const hasValidCharacterImage = character.image_url && !character.image_url.startsWith('error:')
        const referenceImage = hasValidCharacterImage ? character.image_url : mainCharacter.image_url

        // Pass visual_reference_image only for single character regeneration
        const visualRef = character_id ? visual_reference_image : undefined

        const result = await generateCharacterImage(character, referenceImage, project_id, custom_prompt, visualRef)

        console.log(`[Character Generate] Result for ${character.name || character.role}: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`)
        
        // If generation failed, save error to image_url field so UI can display it
        if (!result.success && result.error) {
          console.log(`[Character Generate] ⚠️ Saving error state for ${character.name || character.role}: ${result.error}`)
          await supabase
            .from('characters')
            .update({ image_url: `error:${result.error}` })
            .eq('id', character.id)
        }
        
        results.push({
          character_id: character.id,
          success: result.success,
          image_url: result.imageUrl,
          error: result.error
        })

        // Trigger sketch generation asynchronously after successful colored generation
        if (result.success && result.imageUrl) {
          console.log(`[Character Generate] ✅ Colored complete for ${character.name || character.role}, triggering sketch...`)
          ;(async () => {
            try {
              const { generateCharacterSketch } = await import('@/lib/ai/character-sketch-generator')
              await generateCharacterSketch(
                character.id,
                result.imageUrl,
                project_id,
                character.name || character.role || 'Character'
              )
            } catch (sketchError) {
              console.error(`[Character Generate] ❌ Sketch generation failed for ${character.name || character.role}:`, sketchError)
            }
          })()
        } else {
          console.log(`[Character Generate] ⚠️ Skipping sketch for ${character.name || character.role} - colored generation failed or no image URL`)
        }
      } catch (error: unknown) {
        // Should catch errors that escaped generateCharacterImage
        const errorMessage = getErrorMessage(error, 'Generation failed')
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
    console.log(`[Character Generate] 📊 Summary: ${results.filter(r => r.success).length}/${results.length} succeeded`)
    
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
  } catch (error: unknown) {
    console.error('Error generating character images:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate character images') },
      { status: 500 }
    )
  }
}




















