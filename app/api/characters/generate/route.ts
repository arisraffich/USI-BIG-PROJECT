import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { replicate } from '@/lib/ai/replicate'
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
      } catch (error: any) {
        // Should catch errors that escaped generateCharacterImage
        console.error(`Error in loop for character ${character.id}:`, error)
        results.push({
          character_id: character.id,
          success: false,
          error: error.message || 'Generation failed',
        })
      }
    }

    // Update project status if all succeeded
    const allSucceeded = results.every((r) => r.success)
    if (allSucceeded && results.length > 0) {
      // Determine appropriate status based on whether this is first generation or regeneration
      const { data: project } = await supabase
        .from('projects')
        .select('character_send_count')
        .eq('id', project_id)
        .single()

      const newStatus = (project?.character_send_count || 0) > 0
        ? 'characters_regenerated'
        : 'character_generation_complete'

      await supabase
        .from('projects')
        .update({ status: newStatus })
        .eq('id', project_id)
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












