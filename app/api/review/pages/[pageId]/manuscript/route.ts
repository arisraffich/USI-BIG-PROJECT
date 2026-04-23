import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'
import { getReviewToken, reviewUnauthorized, verifyReviewTokenForPage } from '@/lib/auth/review-token'

function sanitize(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const supabase = await createAdminClient()

    const isAuthorized = await verifyReviewTokenForPage(supabase, pageId, getReviewToken(request))
    if (!isAuthorized) return reviewUnauthorized()

    const { data: page, error } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (error || !page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    return NextResponse.json(page)
  } catch (error: unknown) {
    console.error('Error fetching customer manuscript page:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to fetch page') },
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

    const isAuthorized = await verifyReviewTokenForPage(supabase, pageId, getReviewToken(request, body))
    if (!isAuthorized) return reviewUnauthorized()

    const updateData: {
      story_text?: string
      scene_description?: string | null
      description_auto_generated?: boolean
      is_customer_edited_story_text?: boolean
      is_customer_edited_scene_description?: boolean
    } = {}

    if (body.story_text !== undefined) {
      updateData.story_text = sanitize(String(body.story_text))
    }

    if (body.scene_description !== undefined) {
      updateData.scene_description = body.scene_description ? sanitize(String(body.scene_description)) : null
      if (body.scene_description) {
        updateData.description_auto_generated = false
      }
    }

    if (body.is_customer_edited_story_text !== undefined) {
      updateData.is_customer_edited_story_text = Boolean(body.is_customer_edited_story_text)
    }

    if (body.is_customer_edited_scene_description !== undefined) {
      updateData.is_customer_edited_scene_description = Boolean(body.is_customer_edited_scene_description)
    }

    const { data: page, error } = await supabase
      .from('pages')
      .update(updateData)
      .eq('id', pageId)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: `Failed to update page: ${error.message || JSON.stringify(error)}` },
        { status: 500 }
      )
    }

    return NextResponse.json(page)
  } catch (error: unknown) {
    console.error('Error updating customer manuscript page:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to update page') },
      { status: 500 }
    )
  }
}
