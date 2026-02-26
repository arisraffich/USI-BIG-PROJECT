import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

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

    const allowedStatuses = ['character_review', 'character_revision_needed', 'characters_regenerated']
    if (!allowedStatuses.includes(project.status)) {
      return NextResponse.json(
        { error: 'Characters cannot be edited at this time' },
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
        is_resolved: false,
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

    // Update project status and notify when feedback is added
    if (body.feedback_notes && body.feedback_notes.trim()) {
      await supabase
        .from('projects')
        .update({ status: 'character_revision_needed' })
        .eq('id', character.project_id)
        .eq('status', 'character_review')

      const { data: fullProject } = await supabase
        .from('projects')
        .select('book_title, author_firstname, author_lastname')
        .eq('id', character.project_id)
        .single()

      if (fullProject) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const { notifyCharacterReview } = await import('@/lib/notifications')
        notifyCharacterReview({
          projectTitle: fullProject.book_title || 'Untitled Project',
          authorName: `${fullProject.author_firstname || ''} ${fullProject.author_lastname || ''}`.trim() || 'Customer',
          characterName: updatedCharacter.name || updatedCharacter.role || 'Character',
          feedbackText: body.feedback_notes,
          projectUrl: `${baseUrl}/admin/project/${character.project_id}?tab=characters`,
        }).catch(e => console.error('Notification error:', e))
      }
    }

    return NextResponse.json(updatedCharacter)
  } catch (error: unknown) {
    console.error('Error updating character:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to update character') },
      { status: 500 }
    )
  }
}














