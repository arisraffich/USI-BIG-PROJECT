import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createErrorResponse, createValidationError, createNotFoundError } from '@/lib/utils/api-error'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, name, role, story_role } = body
    const supabase = await createAdminClient()

    if (!project_id) {
      return createValidationError('Project ID is required')
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .single()

    if (projectError || !project) {
      return createNotFoundError('Project')
    }

    const { data: character, error: createError } = await supabase
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

    if (createError) {
      return createErrorResponse(createError, 'Failed to create character', 500)
    }

    return NextResponse.json(character)
  } catch (error) {
    return createErrorResponse(error, 'Failed to create character', 500)
  }
}

