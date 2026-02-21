import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for character generation
export const dynamic = 'force-dynamic'

/**
 * Complete the customer submission wizard.
 * - Saves character form data
 * - If no scene descriptions provided, generates them via AI
 * - Changes project status to character_generation
 * - Triggers character image generation (fire-and-forget)
 * - Sends notifications
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { characterEdits } = body

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Find project and verify status
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, author_email, status, review_token')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Accept both awaiting_customer_input (initial) and character_review (after identify-characters ran)
    const validStatuses = ['awaiting_customer_input', 'character_review']
    if (!validStatuses.includes(project.status)) {
      return NextResponse.json({ error: 'Project is not accepting submissions' }, { status: 403 })
    }

    const authorName = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim()

    // Save character form data if provided
    if (characterEdits && Object.keys(characterEdits).length > 0) {
      console.log(`[Submission Complete] Saving character edits for ${Object.keys(characterEdits).length} characters`)

      await Promise.all(
        Object.entries(characterEdits).map(async ([charId, data]) => {
          const formData = data as Record<string, string>
          const { error: updateError } = await supabase
            .from('characters')
            .update({
              age: formData.age || null,
              gender: formData.gender || null,
              skin_color: formData.skin_color || null,
              hair_color: formData.hair_color || null,
              hair_style: formData.hair_style || null,
              eye_color: formData.eye_color || null,
              clothing: formData.clothing || null,
              accessories: formData.accessories || null,
              special_features: formData.special_features || null,
            })
            .eq('id', charId)

          if (updateError) {
            console.error(`[Submission Complete] Error updating character ${charId}:`, updateError)
          }
        })
      )
    }

    // Check if scene descriptions need to be generated
    const { data: pages } = await supabase
      .from('pages')
      .select('id, story_text, scene_description, description_auto_generated')
      .eq('project_id', project.id)
      .order('page_number', { ascending: true })

    const needsSceneGeneration = pages?.some(p => p.description_auto_generated && !p.scene_description)

    if (needsSceneGeneration && pages) {
      console.log(`[Submission Complete] Generating scene descriptions for project ${project.id}`)
      try {
        // Use AI to generate scene descriptions from story text
        const { parsePagesWithAI } = await import('@/lib/utils/file-parser')
        const fullStoryText = pages.map(p => p.story_text || '').join('\n\n---PAGE BREAK---\n\n')
        const aiPages = await parsePagesWithAI(fullStoryText)

        // Update pages with generated scene descriptions
        for (const aiPage of aiPages) {
          const pageIndex = aiPage.page_number - 1
          if (pageIndex >= 0 && pageIndex < pages.length) {
            const pageToUpdate = pages[pageIndex]
            await supabase
              .from('pages')
              .update({
                scene_description: aiPage.scene_description || null,
                character_actions: aiPage.character_actions || null,
                background_elements: aiPage.background_elements || null,
                atmosphere: aiPage.atmosphere || null,
                description_auto_generated: true,
              })
              .eq('id', pageToUpdate.id)
          }
        }
        console.log(`[Submission Complete] Generated scene descriptions for ${aiPages.length} pages`)
      } catch (genError: unknown) {
        console.error('[Submission Complete] Failed to generate scene descriptions:', getErrorMessage(genError))
        // Continue anyway — admin can handle this
      }
    }

    // Fetch characters to determine next status
    const { data: allCharacters, error: charsError } = await supabase
      .from('characters')
      .select('id, name, role, is_main, image_url, age, gender, skin_color, hair_color, hair_style, eye_color, clothing, accessories, special_features, reference_photo_url')
      .eq('project_id', project.id)

    if (charsError || !allCharacters) {
      console.error('[Submission Complete] Failed to fetch characters:', charsError)
      return NextResponse.json({ error: 'Failed to load character data. Please try again.' }, { status: 500 })
    }

    const secondaryCharacters = allCharacters.filter(c => !c.is_main)
    const pendingGeneration = secondaryCharacters.some(c => !c.image_url || c.image_url.trim() === '')

    let newStatus: string
    if (pendingGeneration && secondaryCharacters.length > 0) {
      newStatus = 'character_generation'
    } else if (secondaryCharacters.length === 0) {
      newStatus = 'characters_approved'
    } else {
      newStatus = 'character_generation_complete'
    }

    // Optimistic lock: only update if status hasn't changed since we read it
    const { data: statusUpdate, error: statusError } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', project.id)
      .eq('status', project.status)
      .select('id')

    if (statusError || !statusUpdate?.length) {
      console.error('[Submission Complete] Status race detected — another request already changed the status')
      return NextResponse.json({ error: 'Project was already submitted' }, { status: 409 })
    }

    console.log(`[Submission Complete] Project ${project.id} status → ${newStatus}`)

    // Trigger character generation if needed (fire-and-forget)
    if (newStatus === 'character_generation' && pendingGeneration) {
      const charactersToGenerate = secondaryCharacters.filter(c => !c.image_url || c.image_url.trim() === '')
      const mainChar = allCharacters?.find(c => c.is_main)
      const mainCharImage = mainChar?.image_url || ''

      console.log(`[Submission Complete] Triggering generation for ${charactersToGenerate.length} characters`)

      ;(async () => {
        try {
          const { generateCharacterImage } = await import('@/lib/ai/character-generator')
          
          const results = await Promise.all(
            charactersToGenerate.map((char) =>
              generateCharacterImage(char as any, mainCharImage, project.id)
                .then(result => ({ ...result, charId: char.id, charName: char.name }))
                .catch(err => {
                  console.error(`[Bg Generation] Character ${char.name} ERROR:`, err)
                  return { success: false, imageUrl: '', charId: char.id, charName: char.name }
                })
            )
          )

          const allSucceeded = results.every(r => r.success)
          const supabaseAdmin = await createAdminClient()

          if (allSucceeded) {
            await supabaseAdmin.from('projects').update({ status: 'character_generation_complete' }).eq('id', project.id)

            // Trigger sketch generation for all characters
            const { generateCharacterSketch } = await import('@/lib/ai/character-sketch-generator')
            
            if (mainChar?.image_url) {
              generateCharacterSketch(
                mainChar.id,
                mainChar.image_url,
                project.id,
                mainChar.name || mainChar.role || 'Main Character'
              ).catch(err => console.error('[Bg] Main char sketch failed:', err))
            }

            results.forEach((result) => {
              if (result.success && result.imageUrl) {
                const character = charactersToGenerate.find(c => c.id === result.charId)
                if (character) {
                  generateCharacterSketch(
                    character.id,
                    result.imageUrl,
                    project.id,
                    character.name || character.role || 'Character'
                  ).catch(err => console.error(`[Bg] Sketch failed for ${character.name}:`, err))
                }
              }
            })
          } else {
            const failedCount = results.filter(r => !r.success).length
            console.error(`[Bg Generation] ${failedCount}/${results.length} characters failed — setting character_generation_failed`)
            await supabaseAdmin.from('projects').update({ status: 'character_generation_failed' }).eq('id', project.id)
          }

          // Send completion notification
          try {
            const { notifyCharacterGenerationComplete } = await import('@/lib/notifications')
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
            await notifyCharacterGenerationComplete({
              projectId: project.id,
              projectTitle: project.book_title,
              authorName,
              projectUrl: `${baseUrl}/admin/project/${project.id}`,
              generatedCount: results.filter(r => r.success).length,
              failedCount: results.filter(r => !r.success).length,
            })
          } catch (e) {
            console.error('[Bg] Notification error:', e)
          }
        } catch (err: unknown) {
          console.error('[Bg Generation] CRITICAL ERROR:', getErrorMessage(err))
          try {
            const supabaseAdmin = await createAdminClient()
            await supabaseAdmin.from('projects').update({ status: 'character_generation_failed' }).eq('id', project.id)
          } catch { /* last resort — status stays at character_generation */ }
        }
      })()
    }

    // Send notifications
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Slack notification to admin (with character form data, same as legacy path)
    try {
      const { notifyCustomerSubmission } = await import('@/lib/notifications')
      await notifyCustomerSubmission({
        projectId: project.id,
        projectTitle: project.book_title,
        authorName,
        projectUrl: `${baseUrl}/admin/project/${project.id}`,
        characters: secondaryCharacters.map(c => ({
          name: c.name,
          role: c.role,
          age: c.age,
          gender: c.gender,
          skin_color: c.skin_color,
          hair_color: c.hair_color,
          hair_style: c.hair_style,
          eye_color: c.eye_color,
          clothing: c.clothing,
          accessories: c.accessories,
          special_features: c.special_features,
        })),
      })
    } catch (e) {
      console.error('[Submission Complete] Slack notification failed:', e)
    }

    // Email notification to info@
    try {
      const { sendEmail } = await import('@/lib/notifications/email')
      const { renderTemplate } = await import('@/lib/email/renderer')
      const rendered = await renderTemplate('submission_internal', {
        authorName,
        secondaryCharacterCount: String(secondaryCharacters.length),
        status: newStatus,
        projectAdminUrl: `${baseUrl}/admin/project/${project.id}`,
      })
      await sendEmail({
        to: 'info@usillustrations.com',
        subject: rendered?.subject || `${authorName}'s project submission is complete`,
        html: rendered?.html || `<p><strong>${authorName}</strong> has completed their project submission.</p><p><strong>Secondary Characters:</strong> ${secondaryCharacters.length}</p><p><strong>Status:</strong> ${newStatus}</p><p><a href="${baseUrl}/admin/project/${project.id}">View Project</a></p>`,
      })
    } catch (e) {
      console.error('[Submission Complete] Email notification failed:', e)
    }

    // Confirmation email to customer
    try {
      const { sendEmail } = await import('@/lib/notifications/email')
      const { renderTemplate } = await import('@/lib/email/renderer')
      const rendered = await renderTemplate('submission_confirmation', {
        authorFirstName: project.author_firstname || 'there',
      })
      await sendEmail({
        to: project.author_email,
        subject: rendered?.subject || 'We received your submission!',
        html: rendered?.html || `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #1a1a1a;">Thank You, ${project.author_firstname}!</h2><p style="color: #555; font-size: 16px; line-height: 1.6;">We've received your project submission and our illustrators are getting started!</p><p style="color: #555; font-size: 16px; line-height: 1.6;">Here's what happens next:</p><ol style="color: #555; font-size: 16px; line-height: 1.8;"><li>We'll create character illustrations based on your descriptions</li><li>You'll receive an email to review and approve the characters</li><li>Full scene illustrations will be created and sent for your review</li></ol><p style="color: #888; font-size: 14px; margin-top: 24px;">You'll receive email updates at each step. No action needed from you right now!</p></div>`,
      })
    } catch (e) {
      console.error('[Submission Complete] Customer confirmation email failed:', e)
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
    })
  } catch (error: unknown) {
    console.error('[Submission Complete] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to complete submission') },
      { status: 500 }
    )
  }
}
