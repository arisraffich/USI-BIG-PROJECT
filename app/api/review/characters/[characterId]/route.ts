import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params
    const body = await request.json()

    const supabase = await createAdminClient()

    // Get character to verify it exists and get project_id
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('id, project_id, is_main')
      .eq('id', characterId)
      .single()

    if (charError || !character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    // Don't allow editing main character
    if (character.is_main) {
      return NextResponse.json(
        { error: 'Cannot edit main character' },
        { status: 403 }
      )
    }

    // Verify project is in correct status
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('id', character.project_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (project.status !== 'character_review') {
      return NextResponse.json(
        { error: 'Cannot edit characters in this project' },
        { status: 403 }
      )
    }

    // Update character
    const { data: updatedCharacter, error: updateError } = await supabase
      .from('characters')
      .update({
        age: body.age || null,
        gender: body.gender || null,
        skin_color: body.skin_color || null,
        hair_color: body.hair_color || null,
        hair_style: body.hair_style || null,
        eye_color: body.eye_color || null,
        clothing: body.clothing || null,
        accessories: body.accessories || null,
        special_features: body.special_features || null,
        feedback_notes: body.feedback_notes || null,
      })
      .eq('id', characterId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating character:', updateError)
      return NextResponse.json(
        { error: 'Failed to update character' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedCharacter)
  } catch (error: any) {
    console.error('Error updating character:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update character' },
      { status: 500 }
    )
  }
}






