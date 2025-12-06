import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params
    const supabase = await createAdminClient()

    // First, check if this is the main character
    const { data: character, error: fetchError } = await supabase
      .from('characters')
      .select('is_main, project_id')
      .eq('id', characterId)
      .single()

    if (fetchError || !character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    if (character.is_main) {
      return NextResponse.json(
        { error: 'Cannot delete main character' },
        { status: 400 }
      )
    }

    // Remove character from all pages' character_ids arrays
    const { data: pages } = await supabase
      .from('pages')
      .select('id, character_ids')
      .eq('project_id', character.project_id)

    if (pages) {
      for (const page of pages) {
        if (page.character_ids && Array.isArray(page.character_ids)) {
          const updatedIds = page.character_ids.filter((id: string) => id !== characterId)
          await supabase
            .from('pages')
            .update({ character_ids: updatedIds })
            .eq('id', page.id)
        }
      }
    }

    // Delete the character
    const { error: deleteError } = await supabase
      .from('characters')
      .delete()
      .eq('id', characterId)

    if (deleteError) {
      console.error('Error deleting character:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete character' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting character:', error)
    return NextResponse.json(
      { error: 'Failed to delete character' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params
    const body = await request.json()
    const supabase = await createAdminClient()

    const {
      age,
      gender,
      ethnicity,
      skin_color,
      hair_color,
      hair_style,
      eye_color,
      clothing,
      accessories,
      special_features,
    } = body

    const updateData: {
      age?: string | null
      gender?: string | null
      ethnicity?: string | null
      skin_color?: string | null
      hair_color?: string | null
      hair_style?: string | null
      eye_color?: string | null
      clothing?: string | null
      accessories?: string | null
      special_features?: string | null
    } = {}

    // Only include fields that are provided
    if (age !== undefined) updateData.age = age || null
    if (gender !== undefined) updateData.gender = gender || null
    if (ethnicity !== undefined) updateData.ethnicity = ethnicity || null
    if (skin_color !== undefined) updateData.skin_color = skin_color || null
    if (hair_color !== undefined) updateData.hair_color = hair_color || null
    if (hair_style !== undefined) updateData.hair_style = hair_style || null
    if (eye_color !== undefined) updateData.eye_color = eye_color || null
    if (clothing !== undefined) updateData.clothing = clothing || null
    if (accessories !== undefined) updateData.accessories = accessories || null
    if (special_features !== undefined) updateData.special_features = special_features || null

    const { data: character, error } = await supabase
      .from('characters')
      .update(updateData)
      .eq('id', characterId)
      .select()
      .single()

    if (error) {
      console.error('Error updating character:', error)
      return NextResponse.json(
        { error: 'Failed to update character' },
        { status: 500 }
      )
    }

    return NextResponse.json(character)
  } catch (error: any) {
    console.error('Error updating character:', error)
    return NextResponse.json(
      { error: 'Failed to update character' },
      { status: 500 }
    )
  }
}

