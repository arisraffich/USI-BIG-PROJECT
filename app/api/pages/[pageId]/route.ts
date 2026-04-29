import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

type SupabaseAdminClient = Awaited<ReturnType<typeof createAdminClient>>

// ---------------------------------------------------------------------------
// FUTURE: "Add Page" feature
// Use renumberPagesAfterDelete() as a template — create renumberPagesAfterInsert()
// that shifts page_numbers UP by 1 for all pages >= insertPosition.
// Then INSERT a new page row at that position with empty story_text/scene_description.
// Wire it into the sidebar/board UI with an "Add Page" button.
// ---------------------------------------------------------------------------

/**
 * Renumber all pages in a project after a page is deleted.
 * Shifts page_numbers so they're sequential (1, 2, 3...) with no gaps.
 */
async function renumberPagesAfterDelete(supabase: SupabaseAdminClient, projectId: string) {
  const { data: remaining, error } = await supabase
    .from('pages')
    .select('id, page_number')
    .eq('project_id', projectId)
    .order('page_number', { ascending: true })

  if (error || !remaining) return

  for (let i = 0; i < remaining.length; i++) {
    const expectedNumber = i + 1
    if (remaining[i].page_number !== expectedNumber) {
      await supabase
        .from('pages')
        .update({ page_number: expectedNumber })
        .eq('id', remaining[i].id)
    }
  }
}

/**
 * Extract storage path from a Supabase public URL.
 * e.g. "https://xxx.supabase.co/storage/v1/object/public/illustrations/proj/file.png"
 * → "proj/file.png"
 */
function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  let path = url.substring(idx + marker.length)
  const qIdx = path.indexOf('?')
  if (qIdx !== -1) path = path.substring(0, qIdx)
  return decodeURIComponent(path)
}

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
  } catch (error: unknown) {
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

    const sanitize = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')

    if (story_text !== undefined) {
      updateData.story_text = sanitize(story_text)
    }

    if (scene_description !== undefined) {
      updateData.scene_description = scene_description ? sanitize(scene_description) : null
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
  } catch (error: unknown) {
    console.error('Error updating page:', error)
    return NextResponse.json(
      { error: 'Failed to update page' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const supabase = await createAdminClient()

    // 1. Fetch the page to get project_id and file URLs before deleting
    const { data: page, error: fetchError } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (fetchError || !page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const projectId = page.project_id
    console.log(`[Page Delete] Deleting page ${page.page_number} (${pageId}) from project ${projectId}`)

    // 2. Delete associated files from Supabase Storage
    const filesToDelete: { bucket: string; path: string }[] = []

    const urlFields: { field: string; bucket: string }[] = [
      { field: 'illustration_url', bucket: 'illustrations' },
      { field: 'original_illustration_url', bucket: 'illustrations' },
      { field: 'customer_illustration_url', bucket: 'illustrations' },
      { field: 'sketch_url', bucket: 'sketches' },
      { field: 'customer_sketch_url', bucket: 'sketches' },
    ]

    for (const { field, bucket } of urlFields) {
      const url = page[field]
      if (url && typeof url === 'string') {
        const path = extractStoragePath(url, bucket)
        if (path) {
          filesToDelete.push({ bucket, path })
        }
      }
    }

    // Group by bucket and delete
    const bucketGroups: Record<string, string[]> = {}
    for (const { bucket, path } of filesToDelete) {
      if (!bucketGroups[bucket]) bucketGroups[bucket] = []
      if (!bucketGroups[bucket].includes(path)) {
        bucketGroups[bucket].push(path)
      }
    }

    for (const [bucket, paths] of Object.entries(bucketGroups)) {
      console.log(`[Page Delete] Removing ${paths.length} file(s) from ${bucket}:`, paths)
      await supabase.storage.from(bucket).remove(paths).catch((err: unknown) => {
        console.warn(`[Page Delete] Failed to delete from ${bucket}:`, err)
      })
    }

    // 3. Delete the page row from the database
    const { error: deleteError } = await supabase
      .from('pages')
      .delete()
      .eq('id', pageId)

    if (deleteError) {
      console.error('[Page Delete] DB delete failed:', deleteError)
      return NextResponse.json(
        { error: `Failed to delete page: ${deleteError.message}` },
        { status: 500 }
      )
    }

    // 4. Renumber remaining pages so there are no gaps
    await renumberPagesAfterDelete(supabase, projectId)

    console.log(`[Page Delete] Successfully deleted page ${page.page_number} and renumbered remaining pages`)

    return NextResponse.json({
      success: true,
      deletedPageNumber: page.page_number,
      storyText: page.story_text || '',
    })
  } catch (error: unknown) {
    console.error('[Page Delete] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to delete page') },
      { status: 500 }
    )
  }
}
