import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const supabase = await createAdminClient()

    const { data: page, error } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (error || !page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(page)
  } catch (error: any) {
    console.error('Error fetching page:', error)
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const body = await request.json()
    const supabase = await createAdminClient()

    const { 
      story_text, 
      scene_description, 
      is_customer_edited_story_text,
      is_customer_edited_scene_description 
    } = body

    const updateData: {
      story_text?: string
      scene_description?: string | null
      description_auto_generated?: boolean
      is_customer_edited_story_text?: boolean
      is_customer_edited_scene_description?: boolean
    } = {}

    if (story_text !== undefined) {
      updateData.story_text = story_text
    }

    if (scene_description !== undefined) {
      updateData.scene_description = scene_description || null
      // If user edits the description, mark it as not auto-generated
      if (scene_description) {
        updateData.description_auto_generated = false
      }
    }

    if (is_customer_edited_story_text !== undefined) {
      updateData.is_customer_edited_story_text = is_customer_edited_story_text
    }

    if (is_customer_edited_scene_description !== undefined) {
      updateData.is_customer_edited_scene_description = is_customer_edited_scene_description
    }

    const { data: page, error } = await supabase
      .from('pages')
      .update(updateData)
      .eq('id', pageId)
      .select()
      .single()

    if (error) {
      console.error('Error updating page:', error)
      console.error('Update data attempted:', updateData)
      console.error('Page ID:', pageId)
      return NextResponse.json(
        { error: `Failed to update page: ${error.message || JSON.stringify(error)}` },
        { status: 500 }
      )
    }

    return NextResponse.json(page)
  } catch (error: any) {
    console.error('Error updating page:', error)
    return NextResponse.json(
      { error: 'Failed to update page' },
      { status: 500 }
    )
  }
}





