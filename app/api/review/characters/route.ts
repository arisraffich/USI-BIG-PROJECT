import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, name, role, story_role } = body

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Verify project exists and is in correct status
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('id', project_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (project.status !== 'character_review') {
      return NextResponse.json(
        { error: 'Cannot add characters to this project' },
        { status: 403 }
      )
    }

    // Create character
    const { data: character, error: charError } = await supabase
      .from('characters')
      .insert({
        project_id,
        name: name || null,
        role: role || null,
        story_role: story_role || null,
        is_main: false,
        appears_in: [],
      })
      .select()
      .single()

    if (charError) {
      console.error('Error creating character:', charError)
      return NextResponse.json(
        { error: 'Failed to create character' },
        { status: 500 }
      )
    }

    return NextResponse.json(character)
  } catch (error: any) {
    console.error('Error creating character:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create character' },
      { status: 500 }
    )
  }
}














