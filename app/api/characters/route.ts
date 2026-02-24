import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createErrorResponse, createValidationError, createNotFoundError } from '@/lib/utils/api-error'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, name, role, story_role, appears_in } = body
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

    const pageAppearances = Array.isArray(appears_in) ? appears_in : []

    const { data: character, error: createError } = await supabase
      .from('characters')
      .insert({
        project_id,
        name: name || null,
        role: role || null,
        story_role: story_role || null,
        is_main: false,
        appears_in: pageAppearances,
      })
      .select()
      .single()

    if (createError) {
      return createErrorResponse(createError, 'Failed to create character', 500)
    }

    // Update page character_ids for pages this character appears in
    if (pageAppearances.length > 0 && character) {
      const { data: pages } = await supabase
        .from('pages')
        .select('id, page_number, character_ids')
        .eq('project_id', project_id)

      if (pages) {
        for (const page of pages) {
          if (pageAppearances.includes(page.page_number.toString())) {
            const existingIds = page.character_ids || []
            if (!existingIds.includes(character.id)) {
              await supabase
                .from('pages')
                .update({ character_ids: [...existingIds, character.id] })
                .eq('id', page.id)
            }
          }
        }
      }
    }

    return NextResponse.json(character)
  } catch (error) {
    return createErrorResponse(error, 'Failed to create character', 500)
  }
}

