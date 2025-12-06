import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseCharacterForm } from '@/lib/ai/openai'
import { parseStoryFile, parsePages, parsePagesWithAI } from '@/lib/utils/file-parser'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 60
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
    const mainCharacterImage = formData.get('main_character_image') as File | null
    const characterFormPdf = formData.get('character_form_pdf') as File | null
    const storyFile = formData.get('story_file') as File | null

    // Validate required fields
    if (!bookTitle || !authorFullname || !authorEmail || !authorPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', received: { bookTitle: !!bookTitle, authorFullname: !!authorFullname, authorEmail: !!authorEmail, authorPhone: !!authorPhone } },
        { status: 400 }
      )
    }

    if (!mainCharacterImage || !characterFormPdf || !storyFile) {
      return NextResponse.json(
        { error: 'All files are required', received: { image: !!mainCharacterImage, pdf: !!characterFormPdf, story: !!storyFile } },
        { status: 400 }
      )
    }

    // Validate file types
    if (!(mainCharacterImage instanceof File) || !(characterFormPdf instanceof File) || !(storyFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid file types', details: 'All file fields must be File objects' },
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
    let pdfBuffer: Buffer
    let storyBuffer: Buffer
    
    try {
      mainCharacterBuffer = Buffer.from(await mainCharacterImage.arrayBuffer())
      pdfBuffer = Buffer.from(await characterFormPdf.arrayBuffer())
      storyBuffer = Buffer.from(await storyFile.arrayBuffer())
    } catch (bufferError: any) {
      console.error('Error converting files to buffers:', bufferError)
      return NextResponse.json(
        { error: 'Failed to process files', details: bufferError.message },
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

    // Upload PDF form
    const pdfPath = `${projectId}/character-form.pdf`
    const { error: pdfError } = await supabase.storage
      .from('project-files')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
      })

    if (pdfError) {
      console.error('Error uploading PDF:', pdfError)
      return NextResponse.json(
        { error: 'Failed to upload PDF', details: pdfError.message },
        { status: 500 }
      )
    }

    const { data: pdfUrlData } = supabase.storage
      .from('project-files')
      .getPublicUrl(pdfPath)
    const formPdfUrl = pdfUrlData.publicUrl

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

    // Parse character form PDF
    let characterData = {
      name: null,
      age: null,
      ethnicity: null,
      skin_color: null,
      hair_color: null,
      hair_style: null,
      eye_color: null,
      clothing: null,
      accessories: null,
      special_features: null,
      gender: null,
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is missing. Character form PDF will not be parsed.')
    } else {
      try {
        characterData = await parseCharacterForm(pdfBuffer)
      } catch (error: any) {
        console.error('Error parsing character form:', error.message)
        // Continue without character data - can be filled manually later
        // This allows project creation to succeed even if PDF parsing fails
      }
    }

    // Merge clothing, accessories, and special_features into a single clothing field
    const clothingParts = [
      characterData.clothing,
      characterData.accessories,
      characterData.special_features,
    ].filter(Boolean)
    const mergedClothing = clothingParts.length > 0 ? clothingParts.join('\n') : null

    // Create main character record
    const { data: createdCharacter, error: characterError } = await supabase
      .from('characters')
      .insert({
        project_id: projectId,
        name: characterData.name,
        role: 'Main Character',
        is_main: true,
        age: characterData.age,
        ethnicity: characterData.ethnicity,
        skin_color: characterData.skin_color,
        hair_color: characterData.hair_color,
        hair_style: characterData.hair_style,
        eye_color: characterData.eye_color,
        clothing: mergedClothing,
        accessories: null,
        special_features: null,
        gender: characterData.gender,
        image_url: mainCharacterUrl,
        form_pdf_url: formPdfUrl,
        appears_in: [],
      })
      .select()
      .single()

    if (characterError) {
      console.error('Error creating character:', characterError.message)
      // Don't fail the whole request - character can be created manually
    }

    // Update project status
    await supabase
      .from('projects')
      .update({ status: 'character_review' })
      .eq('id', projectId)

    // Parse story and create pages synchronously (wait for completion)
    try {
      // Determine file type from extension
      const extension = storyPath.split('.').pop()?.toLowerCase() || 'txt'
      let fileType: string
      if (extension === 'pdf') {
        fileType = 'application/pdf'
      } else if (extension === 'docx') {
        fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else {
        fileType = 'text/plain'
      }

      // Parse story file
      const storyText = await parseStoryFile(storyBuffer, fileType)
      
      // Parse into pages using AI (with fallback to pattern-based)
      let pages
      try {
        pages = await parsePagesWithAI(storyText)
      } catch (aiError: any) {
        console.warn('AI parsing failed, falling back to pattern-based:', aiError.message)
        pages = parsePages(storyText)
      }

        if (pages.length > 0) {
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
            })
          )

          // Create page records in database
          const pagesToInsert = pagesWithDescriptions.map(page => ({
            project_id: projectId,
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
            throw new Error(`Failed to create pages: ${insertError.message}`)
          }
        }
    } catch (parseError: any) {
      console.error('Error parsing story:', parseError.message)
      // Don't fail the entire project creation, but log the error
      // Pages can be parsed manually later
    }

    // Trigger character identification asynchronously (non-blocking)
    // This allows the response to return faster while identification runs in background
    fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ai/identify-characters`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      }
    ).catch((identifyError: any) => {
      console.error('Character identification error:', identifyError.message)
      // Don't fail the entire project creation, but log the error
    })

    return NextResponse.json({ 
      success: true,
      project_id: projectId 
    }, { status: 200 })
  } catch (error: any) {
    console.error('Error creating project:', error.message)
    
    // Check if it's a formData parsing error
    if (error?.message?.includes('form-data') || error?.message?.includes('Content-Type')) {
      return NextResponse.json(
        { 
          error: 'Failed to parse form data', 
          details: error.message,
          hint: 'Make sure the request is sent as multipart/form-data'
        },
        { status: 400 }
      )
    }
    
    const errorResponse = {
      error: 'Failed to create project',
      details: error?.message || String(error) || 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error?.stack,
      })
    }
    
    return NextResponse.json(
      errorResponse,
      { status: 500 }
    )
  }
}
