import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Save customer-provided story pages to the database.
 * Called during the customer submission wizard (Path B).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { pages, scene_description_choice } = body

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'Pages are required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Find project by review token and verify status
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Accept both awaiting_customer_input (initial) and character_review (after bg character identification)
    const validStatuses = ['awaiting_customer_input', 'character_review']
    if (!validStatuses.includes(project.status)) {
      return NextResponse.json({ error: 'Project is not accepting submissions' }, { status: 403 })
    }

    // Delete existing pages (in case of re-submission / partial save)
    await supabase
      .from('pages')
      .delete()
      .eq('project_id', project.id)

    // Sanitize text
    const sanitizeText = (text: string | null): string | null => {
      if (!text) return null
      return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .trim()
    }

    // Insert new pages
    const pagesToInsert = pages.map((page: { page_number: number; story_text: string; scene_description: string | null }) => ({
      project_id: project.id,
      page_number: page.page_number,
      story_text: sanitizeText(page.story_text),
      scene_description: sanitizeText(page.scene_description),
      description_auto_generated: scene_description_choice === 'no', // Will be auto-generated later
      character_ids: [],
    }))

    const { error: insertError } = await supabase
      .from('pages')
      .insert(pagesToInsert)

    if (insertError) {
      console.error('[SavePages] Error inserting pages:', insertError)
      return NextResponse.json(
        { error: 'Failed to save pages', details: insertError.message },
        { status: 500 }
      )
    }

    console.log(`[SavePages] Saved ${pages.length} pages for project ${project.id}`)

    return NextResponse.json({
      success: true,
      pages_count: pages.length,
    })
  } catch (error: unknown) {
    console.error('[SavePages] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to save pages') },
      { status: 500 }
    )
  }
}
