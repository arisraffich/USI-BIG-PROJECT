import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseStoryFile, parsePages, parsePagesWithAI } from '@/lib/utils/file-parser'

export async function POST(request: NextRequest) {
  try {
    const { project_id, story_url } = await request.json()

    if (!project_id || !story_url) {
      return NextResponse.json(
        { error: 'Missing project_id or story_url' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Download story file from Supabase Storage
    const urlParts = story_url.split('/')
    const filePath = urlParts.slice(urlParts.indexOf('project-files') + 1).join('/')
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('project-files')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Error downloading story file:', downloadError)
      return NextResponse.json(
        { error: 'Failed to download story file', details: downloadError?.message },
        { status: 500 }
      )
    }

    // Convert blob to buffer
    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Determine file type from extension
    const extension = filePath.split('.').pop()?.toLowerCase() || 'txt'
    let fileType: string
    if (extension === 'pdf') {
      fileType = 'application/pdf'
    } else if (extension === 'docx') {
      fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else {
      fileType = 'text/plain'
    }

    // Parse story file
    const storyText = await parseStoryFile(buffer, fileType)

    // Parse into pages using AI (with fallback to pattern-based)
    let pages
    try {
      pages = await parsePagesWithAI(storyText)
    } catch (aiError: any) {
      console.warn('AI parsing failed, falling back to pattern-based:', aiError.message)
      pages = parsePages(storyText)
    }

    if (pages.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Story parsed but no pages found',
        pagesCreated: 0 
      })
    }

    // Delete existing pages for this project (in case we're re-parsing)
    const { error: deleteError } = await supabase
      .from('pages')
      .delete()
      .eq('project_id', project_id)

    if (deleteError) {
      console.warn('Could not delete existing pages:', deleteError.message)
      // Continue anyway - might be a duplicate key error which is fine
    }

    // Create page records in database
    const pagesToInsert = pages.map(page => ({
      project_id,
      page_number: page.page_number,
      story_text: page.story_text,
      scene_description: page.scene_description,
      description_auto_generated: page.description_auto_generated,
      character_ids: [],
    }))

    const { error: insertError } = await supabase
      .from('pages')
      .insert(pagesToInsert)

    if (insertError) {
      console.error('Error creating pages:', insertError.message)
      return NextResponse.json(
        { error: 'Failed to create pages', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      pagesCreated: pages.length 
    })
  } catch (error: any) {
    console.error('Error in parse-story:', error.message)
    return NextResponse.json(
      { error: 'Failed to parse story', details: error.message },
      { status: 500 }
    )
  }
}
