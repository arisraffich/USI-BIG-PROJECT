import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseStoryFile, parsePages, parsePagesWithAI } from '@/lib/utils/file-parser'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = createAdminClient()

    // Find the story file in storage (it should be at {projectId}/story.*)
    const { data: files, error: listError } = await supabase.storage
      .from('project-files')
      .list(id, { limit: 100 })

    if (listError) {
      console.error('Error listing files:', listError)
      return NextResponse.json(
        { error: 'Failed to list project files', details: listError.message },
        { status: 500 }
      )
    }

    // Find the story file (should be named story.*)
    const storyFile = files?.find(file => 
      file.name.toLowerCase().startsWith('story.')
    )

    if (!storyFile) {
      return NextResponse.json(
        { error: 'Story file not found in project files' },
        { status: 404 }
      )
    }

    const storyPath = `${id}/${storyFile.name}`

    // Download story file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('project-files')
      .download(storyPath)

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
    const extension = storyFile.name.split('.').pop()?.toLowerCase() || 'txt'
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

    // Generate descriptions for pages that don't have them
    const pagesWithDescriptions = await Promise.all(
      pages.map(async (page) => {
        if (!page.scene_description && page.story_text) {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ai/generate-description`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  story_text: page.story_text,
                  character_names: [], // Will be populated after character identification
                }),
              }
            )
            
            if (response.ok) {
              const { description } = await response.json()
              return {
                ...page,
                scene_description: description,
                description_auto_generated: true,
              }
            }
          } catch (error: any) {
            // Silently fail - description can be generated later
          }
        }
        return {
          ...page,
          description_auto_generated: false,
        }
        return page
      })
    )

    // Delete existing pages for this project
    const { error: deleteError } = await supabase
      .from('pages')
      .delete()
      .eq('project_id', id)

    if (deleteError) {
      console.warn('Could not delete existing pages:', deleteError.message)
    }

    // Create page records in database
    const pagesToInsert = pagesWithDescriptions.map(page => ({
      project_id: id,
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
      pagesCreated: pages.length,
      message: `Successfully parsed story and created ${pages.length} pages`
    })
  } catch (error: any) {
    console.error('Error re-parsing story:', error.message)
    return NextResponse.json(
      { error: 'Failed to parse story', details: error.message },
      { status: 500 }
    )
  }
}

