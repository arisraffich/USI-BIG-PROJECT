import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseCharacterForm } from '@/lib/ai/openai'
import { parseStoryFile, parsePagesWithAI } from '@/lib/utils/file-parser'
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
      biography: null,
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
        story_role: characterData.biography,
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

    // TRIGGER ASYNC PARSING & GENERATION
    // We do NOT await this. We let it run in the background so the user can be redirected immediately.
    // The flow handles: Parse Story -> Create Pages -> Identify Characters -> Create Characters
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Add a small delay to ensure storage operations have completed
    // This prevents race conditions where reparse-story tries to download files before they're fully saved
    setTimeout(() => {
      console.log(`[Background] Triggering story parsing for project ${projectId}...`)
      
      fetch(`${baseUrl}/api/projects/${projectId}/reparse-story`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json()
            console.log(`[Background] Story parsing succeeded for ${projectId}:`, data.message || data)
          } else {
            const errorText = await response.text()
            console.error(`[Background] Story parsing failed for ${projectId} (${response.status}):`, errorText)
          }
        })
        .catch(err => {
          console.error(`[Background] Story parsing request failed for ${projectId}:`, err.message)
        })
    }, 5000) // 5 second delay to ensure storage operations complete

    // Note: We removed the direct call to identify-characters here because reparse-story now calls it.

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
