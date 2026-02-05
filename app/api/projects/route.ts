import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseStoryFile, parsePagesWithAI } from '@/lib/utils/file-parser'
import { v4 as uuidv4 } from 'uuid'
import { getErrorMessage } from '@/lib/utils/error'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for story parsing + AI enhancement
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json(
        { error: 'Server configuration error', details: 'Missing Supabase credentials' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const supabase = createAdminClient()

    if (!supabase) {
      console.error('Failed to initialize Supabase client')
      return NextResponse.json(
        { error: 'Failed to initialize database client' },
        { status: 500 }
      )
    }

    // Extract form fields
    const bookTitle = formData.get('book_title') as string
    const authorFullname = formData.get('author_fullname') as string
    const authorEmail = formData.get('author_email') as string
    const authorPhone = formData.get('author_phone') as string
    const mainCharacterName = formData.get('main_character_name') as string
    const mainCharacterImage = formData.get('main_character_image') as File | null
    const storyFile = formData.get('story_file') as File | null

    // Validate required fields
    if (!bookTitle || !authorFullname || !authorEmail || !authorPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', received: { bookTitle: !!bookTitle, authorFullname: !!authorFullname, authorEmail: !!authorEmail, authorPhone: !!authorPhone } },
        { status: 400 }
      )
    }

    if (!mainCharacterImage || !storyFile) {
      return NextResponse.json(
        { error: 'Main character image and story file are required', received: { image: !!mainCharacterImage, story: !!storyFile } },
        { status: 400 }
      )
    }

    // Validate file types
    if (!(mainCharacterImage instanceof File) || !(storyFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid file types', details: 'File fields must be File objects' },
        { status: 400 }
      )
    }

    // Split author name
    const nameParts = authorFullname.trim().split(/\s+/)
    const authorFirstname = nameParts[0] || ''
    const authorLastname = nameParts.slice(1).join(' ') || ''

    // Generate project ID and review token
    const projectId = uuidv4()
    const reviewToken = uuidv4().replace(/-/g, '').substring(0, 32)

    // Create project record
    const { error: projectError } = await supabase
      .from('projects')
      .insert({
        id: projectId,
        book_title: bookTitle,
        author_firstname: authorFirstname,
        author_lastname: authorLastname,
        author_email: authorEmail,
        author_phone: authorPhone,
        review_token: reviewToken,
        status: 'draft',
      })

    if (projectError) {
      console.error('Error creating project:', projectError)
      return NextResponse.json(
        { error: 'Failed to create project', details: projectError.message },
        { status: 500 }
      )
    }

    // Upload files to Supabase Storage
    let mainCharacterBuffer: Buffer
    let storyBuffer: Buffer

    try {
      mainCharacterBuffer = Buffer.from(await mainCharacterImage.arrayBuffer())
      storyBuffer = Buffer.from(await storyFile.arrayBuffer())
    } catch (bufferError: unknown) {
      console.error('Error converting files to buffers:', bufferError)
      return NextResponse.json(
        { error: 'Failed to process files', details: getErrorMessage(bufferError) },
        { status: 500 }
      )
    }

    // Upload main character image
    const imageExtension = mainCharacterImage.name?.split('.').pop() || 'jpg'
    const mainCharacterPath = `${projectId}/main-character.${imageExtension}`
    const { data: imageUpload, error: imageError } = await supabase.storage
      .from('character-images')
      .upload(mainCharacterPath, mainCharacterBuffer, {
        contentType: mainCharacterImage.type,
      })

    if (imageError) {
      console.error('Error uploading image:', imageError)
      return NextResponse.json(
        { error: 'Failed to upload image', details: imageError.message },
        { status: 500 }
      )
    }

    const { data: imageUrlData } = supabase.storage
      .from('character-images')
      .getPublicUrl(mainCharacterPath)
    const mainCharacterUrl = imageUrlData.publicUrl

    // Upload story file
    const storyExtension = storyFile.name?.split('.').pop() || 'txt'
    const storyPath = `${projectId}/story.${storyExtension}`
    const { error: storyError } = await supabase.storage
      .from('project-files')
      .upload(storyPath, storyBuffer, {
        contentType: storyFile.type,
      })

    if (storyError) {
      console.error('Error uploading story:', storyError)
      return NextResponse.json(
        { error: 'Failed to upload story file', details: storyError.message },
        { status: 500 }
      )
    }

    const { data: storyUrlData } = supabase.storage
      .from('project-files')
      .getPublicUrl(storyPath)
    const storyUrl = storyUrlData.publicUrl

    // Create main character record with the name provided by the admin
    const { data: createdCharacter, error: characterError } = await supabase
      .from('characters')
      .insert({
        project_id: projectId,
        name: mainCharacterName || null, // Name provided by admin in the form
        role: 'Main Character',
        is_main: true,
        image_url: mainCharacterUrl,
        appears_in: [],
      })
      .select()
      .single()

    if (characterError) {
      console.error('Error creating main character:', characterError.message)
      // Don't fail the whole request - character can be created manually
    } else {
      console.log(`[Project Creation] Main character created: "${mainCharacterName}" with image`)
    }

    // Update project status to indicate we're parsing
    await supabase
      .from('projects')
      .update({ status: 'draft' }) // Keep as draft while parsing
      .eq('id', projectId)

    // PARSE STORY AND CREATE PAGES (Direct, Reliable Approach)
    // Instead of unreliable background HTTP fetch, we do it here and wait for completion
    console.log(`[Story Parsing] Starting for project ${projectId}...`)
    
    try {
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

      // Parse story file into text
      console.log(`[Story Parsing] Extracting text from ${fileType}...`)
      const storyText = await parseStoryFile(storyBuffer, fileType)
      
      // Parse into pages with AI (this includes enhancement!)
      console.log(`[Story Parsing] Analyzing story with GPT-5.2...`)
      const pages = await parsePagesWithAI(storyText)
      
      if (pages.length === 0) {
        console.warn(`[Story Parsing] No pages found for project ${projectId}`)
        // Continue anyway - pages can be added manually later
      } else {
        console.log(`[Story Parsing] Successfully parsed ${pages.length} pages`)
        
        // Sanitize text to prevent Unicode escape sequence errors
        const sanitizeText = (text: string | null): string | null => {
          if (!text) return null
          return text
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\\/g, '\\\\') // Escape backslashes
            .trim()
        }

        // Create pages in database
        const pagesToInsert = pages.map(page => ({
          project_id: projectId,
          page_number: page.page_number,
          story_text: sanitizeText(page.story_text),
          scene_description: sanitizeText(page.scene_description), // Display paragraph (backward compatible)
          description_auto_generated: page.description_auto_generated,
          character_actions: page.character_actions || null, // Structured: {"CharacterName": "action"}
          background_elements: sanitizeText(page.background_elements ?? null), // Structured: environment text
          atmosphere: sanitizeText(page.atmosphere ?? null), // Structured: mood/lighting text
          character_ids: [],
        }))

        const { error: pagesError } = await supabase
          .from('pages')
          .insert(pagesToInsert)

        if (pagesError) {
          console.error(`[Story Parsing] Error creating pages:`, pagesError.message)
          throw new Error(`Failed to create pages: ${pagesError.message}`)
        }

        console.log(`[Story Parsing] Created ${pages.length} pages with enhanced descriptions`)
      }

      // Update project status to character_review now that pages are ready
      await supabase
        .from('projects')
        .update({ status: 'character_review' })
        .eq('id', projectId)

      // IDENTIFY CHARACTERS (Synchronous, Reliable Approach)
      // Call character identification directly and wait for completion
      console.log(`[Character Identification] Starting for project ${projectId}...`)
      try {
        const { identifyCharactersForProject } = await import('@/app/api/ai/identify-characters/route')
        const result = await identifyCharactersForProject(projectId)
        
        // Check if result is an error response (NextResponse) or success object
        if (result && 'success' in result && result.success) {
          console.log(`[Character Identification] Completed for ${projectId}:`, {
            characters_created: result.characters_created,
            main_character: result.main_character
          })
        } else {
          console.log(`[Character Identification] Completed for ${projectId} (response format unknown)`)
        }
      } catch (charError: unknown) {
        console.error(`[Character Identification] Error for project ${projectId}:`, getErrorMessage(charError))
        // Don't fail the whole request - characters can be identified manually later
      }

    } catch (parsingError: unknown) {
      console.error(`[Story Parsing] Error for project ${projectId}:`, getErrorMessage(parsingError))
      // Update status to indicate parsing failed
      await supabase
        .from('projects')
        .update({ status: 'draft' })
        .eq('id', projectId)
      // Don't fail the whole request - pages can be created manually via reparse
    }

    console.log(`[Project Created] ${projectId} - Pages created with enhanced descriptions`)

    return NextResponse.json({
      success: true,
      project_id: projectId
    }, { status: 200 })
  } catch (error: unknown) {
    console.error('Error creating project:', getErrorMessage(error))

    // Check if it's a formData parsing error
    if (getErrorMessage(error).includes('form-data') || getErrorMessage(error).includes('Content-Type')) {
      return NextResponse.json(
        {
          error: 'Failed to parse form data',
          details: getErrorMessage(error),
          hint: 'Make sure the request is sent as multipart/form-data'
        },
        { status: 400 }
      )
    }

    const errorResponse = {
      error: 'Failed to create project',
      details: getErrorMessage(error, 'Unknown error'),
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    return NextResponse.json(
      errorResponse,
      { status: 500 }
    )
  }
}
