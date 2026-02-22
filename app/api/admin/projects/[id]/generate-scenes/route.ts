import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processSceneDescriptions } from '@/lib/utils/file-parser'
import { getErrorMessage } from '@/lib/utils/error'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, page_number, story_text, scene_description, description_auto_generated')
      .eq('project_id', projectId)
      .order('page_number', { ascending: true })

    if (pagesError || !pages || pages.length === 0) {
      return NextResponse.json({ error: 'No pages found' }, { status: 404 })
    }

    console.log(`[Generate Scenes] Starting for project ${projectId} "${project.book_title}" — ${pages.length} pages`)

    const processed = await processSceneDescriptions(pages)

    let updated = 0
    for (const page of processed) {
      if (!page.character_actions && !page.background_elements && !page.atmosphere) continue

      const original = pages.find(p => p.page_number === page.page_number)
      if (!original) continue

      await supabase.from('pages').update({
        scene_description: page.scene_description,
        character_actions: page.character_actions || null,
        background_elements: page.background_elements || null,
        atmosphere: page.atmosphere || null,
        description_auto_generated: page.description_auto_generated,
      }).eq('id', original.id)

      updated++
    }

    console.log(`[Generate Scenes] Done — ${updated}/${pages.length} pages updated`)

    return NextResponse.json({
      success: true,
      project: project.book_title,
      total_pages: pages.length,
      updated_pages: updated,
    })
  } catch (error: unknown) {
    console.error('[Generate Scenes] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate scene descriptions') },
      { status: 500 }
    )
  }
}
