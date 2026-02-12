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

    // Determine which path: 'upload_story' (A) or 'send_to_customer' (B)
    const path = (formData.get('path') as string) || 'upload_story'

    // Extract common form fields
    const authorFullname = (formData.get('author_fullname') as string) || ''
    const authorEmail = formData.get('author_email') as string
    const authorPhone = formData.get('author_phone') as string
    const mainCharacterName = formData.get('main_character_name') as string
    const numberOfIllustrations = parseInt(formData.get('number_of_illustrations') as string) || 12
    const mainCharacterImage = formData.get('main_character_image') as File | null

    // Split full name into first/last for database storage
    const nameParts = authorFullname.trim().split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Validate required fields
    if (!authorFullname.trim() || !authorEmail || !authorPhone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (!mainCharacterImage || !(mainCharacterImage instanceof File)) {
      return NextResponse.json(
        { error: 'Main character image is required' },
        { status: 400 }
      )
    }

    // For Path A, story file is required
    const storyFile = formData.get('story_file') as File | null
    if (path === 'upload_story' && (!storyFile || !(storyFile instanceof File))) {
      return NextResponse.json(
        { error: 'Story file is required for upload path' },
        { status: 400 }
      )
    }

    // Generate project ID and review token
    const projectId = uuidv4()
    const reviewToken = uuidv4().replace(/-/g, '').substring(0, 32)

    // Determine initial status based on path
    const initialStatus = path === 'send_to_customer' ? 'awaiting_customer_input' : 'draft'

    // Create project record
    const { error: projectError } = await supabase
      .from('projects')
      .insert({
        id: projectId,
        book_title: `${firstName} ${lastName}'s Book`.trim(), // Placeholder title
        author_firstname: firstName,
        author_lastname: lastName,
        author_email: authorEmail,
        author_phone: authorPhone,
        review_token: reviewToken,
        status: initialStatus,
        number_of_illustrations: numberOfIllustrations,
      })

    if (projectError) {
      console.error('Error creating project:', projectError)
      return NextResponse.json(
        { error: 'Failed to create project', details: projectError.message },
        { status: 500 }
      )
    }

    // Upload main character image to Supabase Storage
    let mainCharacterBuffer: Buffer
    try {
      mainCharacterBuffer = Buffer.from(await mainCharacterImage.arrayBuffer())
    } catch (bufferError: unknown) {
      console.error('Error converting image to buffer:', bufferError)
      return NextResponse.json(
        { error: 'Failed to process image', details: getErrorMessage(bufferError) },
        { status: 500 }
      )
    }

    const imageExtension = mainCharacterImage.name?.split('.').pop() || 'jpg'
    const mainCharacterPath = `${projectId}/main-character.${imageExtension}`
    const { error: imageError } = await supabase.storage
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

    // Create main character record
    const { error: characterError } = await supabase
      .from('characters')
      .insert({
        project_id: projectId,
        name: mainCharacterName || null,
        role: 'Main Character',
        is_main: true,
        image_url: mainCharacterUrl,
        appears_in: [],
      })
      .select()
      .single()

    if (characterError) {
      console.error('Error creating main character:', characterError.message)
    } else {
      console.log(`[Project Creation] Main character created: "${mainCharacterName}" with image`)
    }

    // =====================================================================
    // PATH B: Send to Customer — send link and return immediately
    // =====================================================================
    if (path === 'send_to_customer') {
      console.log(`[Project Creation] Path B: Sending submission link to ${authorEmail}`)

      // Send notification to customer with review link
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const customerUrl = `${baseUrl}/submit/${reviewToken}`

      try {
        const { sendEmail } = await import('@/lib/notifications/email')
        await sendEmail({
          to: authorEmail,
          subject: `Your illustration project is ready to start!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1a1a1a;">Welcome, ${firstName}!</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                We're excited to get started on your children's book illustrations!
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                To begin, we need your story text and some details about your characters.
                Please click the button below to get started:
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${customerUrl}" 
                   style="display: inline-block; padding: 14px 32px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Start Your Project
                </a>
              </div>
              <p style="color: #888; font-size: 14px; line-height: 1.5;">
                This process takes about ${Math.ceil(numberOfIllustrations * 1.5)} minutes. 
                Have your story text ready!
              </p>
              <p style="color: #888; font-size: 14px;">
                If the button doesn't work, copy and paste this link:<br/>
                <a href="${customerUrl}" style="color: #6366f1;">${customerUrl}</a>
              </p>
            </div>
          `,
        })
        console.log(`[Project Creation] Customer email sent to ${authorEmail}`)
      } catch (emailError: unknown) {
        console.error('[Project Creation] Failed to send customer email:', getErrorMessage(emailError))
        // Don't fail — project is created, admin can manually share the link
      }

      // Send Slack notification to admin
      try {
        const { sendSlackNotification } = await import('@/lib/notifications/slack')
        await sendSlackNotification({
          text: `New project created (Path B — Customer Submission)\n*Author:* ${firstName} ${lastName}\n*Email:* ${authorEmail}\n*Project:* <${baseUrl}/admin/project/${projectId}|View Project>`,
        })
      } catch (slackError: unknown) {
        console.error('[Project Creation] Slack notification failed:', getErrorMessage(slackError))
      }

      // Send notification email to info@usillustrations.com
      try {
        const { sendEmail } = await import('@/lib/notifications/email')
        await sendEmail({
          to: 'info@usillustrations.com',
          subject: `New project created: ${firstName} ${lastName}`,
          html: `
            <p>A new project has been created via the customer submission path.</p>
            <p><strong>Author:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${authorEmail}</p>
            <p><strong>Pages:</strong> ${numberOfIllustrations}</p>
            <p><a href="${baseUrl}/admin/project/${projectId}">View Project</a></p>
          `,
        })
      } catch (emailError: unknown) {
        console.error('[Project Creation] Admin email notification failed:', getErrorMessage(emailError))
      }

      return NextResponse.json({
        success: true,
        project_id: projectId,
        review_token: reviewToken,
      }, { status: 200 })
    }

    // =====================================================================
    // PATH A: Upload Story — parse manuscript, identify characters
    // =====================================================================
    if (!storyFile) {
      return NextResponse.json({ error: 'Story file is required' }, { status: 400 })
    }

    let storyBuffer: Buffer
    try {
      storyBuffer = Buffer.from(await storyFile.arrayBuffer())
    } catch (bufferError: unknown) {
      console.error('Error converting story to buffer:', bufferError)
      return NextResponse.json(
        { error: 'Failed to process story file', details: getErrorMessage(bufferError) },
        { status: 500 }
      )
    }

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

    // PARSE STORY AND CREATE PAGES
    console.log(`[Story Parsing] Starting for project ${projectId}...`)
    
    try {
      const extension = storyFile.name.split('.').pop()?.toLowerCase() || 'txt'
      let fileType: string
      if (extension === 'pdf') {
        fileType = 'application/pdf'
      } else if (extension === 'docx') {
        fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else {
        fileType = 'text/plain'
      }

      console.log(`[Story Parsing] Extracting text from ${fileType}...`)
      const storyText = await parseStoryFile(storyBuffer, fileType)
      
      console.log(`[Story Parsing] Analyzing story with GPT-5.2...`)
      const pages = await parsePagesWithAI(storyText)
      
      if (pages.length === 0) {
        console.warn(`[Story Parsing] No pages found for project ${projectId}`)
      } else {
        console.log(`[Story Parsing] Successfully parsed ${pages.length} pages`)
        
        const sanitizeText = (text: string | null): string | null => {
          if (!text) return null
          return text
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
            .replace(/\\/g, '\\\\')
            .trim()
        }

        const pagesToInsert = pages.map(page => ({
          project_id: projectId,
          page_number: page.page_number,
          story_text: sanitizeText(page.story_text),
          scene_description: sanitizeText(page.scene_description),
          description_auto_generated: page.description_auto_generated,
          character_actions: page.character_actions || null,
          background_elements: sanitizeText(page.background_elements ?? null),
          atmosphere: sanitizeText(page.atmosphere ?? null),
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

      // Update project status to character_review
      await supabase
        .from('projects')
        .update({ status: 'character_review' })
        .eq('id', projectId)

      // IDENTIFY CHARACTERS
      console.log(`[Character Identification] Starting for project ${projectId}...`)
      try {
        const { identifyCharactersForProject } = await import('@/app/api/ai/identify-characters/route')
        const result = await identifyCharactersForProject(projectId)
        
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
      }

    } catch (parsingError: unknown) {
      console.error(`[Story Parsing] Error for project ${projectId}:`, getErrorMessage(parsingError))
      await supabase
        .from('projects')
        .update({ status: 'draft' })
        .eq('id', projectId)
    }

    console.log(`[Project Created] ${projectId} - Pages created with enhanced descriptions`)

    return NextResponse.json({
      success: true,
      project_id: projectId
    }, { status: 200 })
  } catch (error: unknown) {
    console.error('Error creating project:', getErrorMessage(error))

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
