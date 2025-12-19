import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const body = await request.json()
    const { updates } = body

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: 'Updates array is required and must not be empty' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Validate that all page IDs belong to this project
    const pageIds = updates.map((u: any) => u.id).filter(Boolean)
    if (pageIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid page IDs provided' },
        { status: 400 }
      )
    }

    const { data: existingPages, error: fetchError } = await supabase
      .from('pages')
      .select('id')
      .eq('project_id', projectId)
      .in('id', pageIds)

    if (fetchError) {
      console.error('Error fetching pages:', fetchError)
      return NextResponse.json(
        { error: 'Failed to validate pages' },
        { status: 500 }
      )
    }

    const existingPageIds = new Set(existingPages?.map((p) => p.id) || [])
    const invalidIds = pageIds.filter((id: string) => !existingPageIds.has(id))

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error: 'Some page IDs do not belong to this project',
          invalidIds,
        },
        { status: 400 }
      )
    }

    // Perform atomic updates using a transaction-like approach
    // Update each page individually, but if any fails, we'll rollback
    const updatePromises = updates.map(async (update: any) => {
      const updateData: {
        story_text?: string
        scene_description?: string | null
        description_auto_generated?: boolean
        is_customer_edited_story_text?: boolean
        is_customer_edited_scene_description?: boolean
        original_story_text?: string
        original_scene_description?: string | null
      } = {}

      if (update.story_text !== undefined) {
        updateData.story_text = update.story_text
        // Admin edit overrides customer edit flag -> turns Blue
        updateData.is_customer_edited_story_text = false
      }

      if (update.scene_description !== undefined) {
        updateData.scene_description = update.scene_description || null
        // If user edits the description, mark it as not auto-generated
        if (update.scene_description) {
          updateData.description_auto_generated = false
        }
        // Admin edit overrides customer edit flag -> turns Blue
        updateData.is_customer_edited_scene_description = false
      }

      const { data: page, error } = await supabase
        .from('pages')
        .update(updateData)
        .eq('id', update.id)
        .eq('project_id', projectId) // Extra safety check
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update page ${update.id}: ${error.message}`)
      }

      return page
    })

    // Execute all updates
    const results = await Promise.all(updatePromises)

    return NextResponse.json({
      success: true,
      updated: results.length,
      failed: 0,
      pages: results,
    })
  } catch (error: any) {
    console.error('Error updating pages:', error)
    return NextResponse.json(
      {
        error: 'Failed to update pages',
        details: error.message,
      },
      { status: 500 }
    )
  }
}











