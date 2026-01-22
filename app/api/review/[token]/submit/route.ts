import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCustomerSubmission, notifyIllustrationsApproved, notifyIllustrationFeedback } from '@/lib/notifications'

import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { pageEdits } = body

    if (!token) {
      return NextResponse.json(
        { error: 'Review token is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Find project by review token
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status, review_token, illustration_send_count')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if project is in correct status
    // Allow submission if in review or if revision needed (re-submitting?)
    // Strictly speaking, should be 'character_review'.
    // Check if project is in correct status
    // Allow submission if in ANY review status
    const allowedStatuses = [
      'character_review', 'character_revision_needed',
      // New illustration statuses
      'trial_review', 'trial_revision',
      'sketches_review', 'sketches_revision',
      // Legacy illustration statuses (for migration)
      'illustration_review', 'illustration_revision_needed'
    ]

    if (!allowedStatuses.includes(project.status)) {
      return NextResponse.json(
        { error: 'Project is not in a reviewable status' },
        { status: 403 }
      )
    }

    // BRANCH 1: ILLUSTRATION REVIEW SUBMISSION
    // Check if in any illustration-related status
    const isIllustrationStatus = [
      'trial_review', 'trial_revision',
      'sketches_review', 'sketches_revision',
      'illustration_review', 'illustration_revision_needed' // Legacy
    ].includes(project.status)
    
    if (isIllustrationStatus) {
      const { illustrationEdits } = body

      // Fetch all pages to handle implicit resolution
      const { data: allPages } = await supabase
        .from('pages')
        .select('id, feedback_notes, is_resolved, feedback_history')
        .eq('project_id', project.id)

      // Process any edits from the submit form (same pattern as characters)
      if (allPages && illustrationEdits) {
        const editsMap = illustrationEdits || {}

        for (const p of allPages) {
          const edit = editsMap[p.id]

          if (edit !== undefined) {
            // User explicitly edited this page in the submit form
            const hasNotes = !!edit && edit.trim() !== ''

            await supabase.from('pages').update({
              feedback_notes: hasNotes ? edit : null,
              is_resolved: !hasNotes
            }).eq('id', p.id)
          }
          // If user didn't edit in submit form, leave the page as-is
          // (preserves feedback_notes saved via individual save buttons)
        }
      }

      // Determine Outcome: Revision vs Approval
      // Check if ANY page has feedback notes (unresolved)
      const { data: pages } = await supabase.from('pages').select('feedback_notes, is_resolved').eq('project_id', project.id)
      const hasFeedback = pages?.some(p => !!p.feedback_notes && !p.is_resolved)
      
      // Determine phase based on send count
      const sendCount = (project as any).illustration_send_count || 0
      const isTrialPhase = sendCount <= 1

      let newStatus: string
      let message: string

      if (hasFeedback) {
        // Feedback = Revision needed
        newStatus = isTrialPhase ? 'trial_revision' : 'sketches_revision'
        message = isTrialPhase 
          ? 'Feedback submitted. We will revise the trial illustration.'
          : 'Feedback submitted. We will revise the sketches.'
      } else {
        // No feedback = Approved
        newStatus = isTrialPhase ? 'trial_approved' : 'illustration_approved'
        message = isTrialPhase 
          ? 'Trial illustration approved! Full production can begin.'
          : 'All sketches approved!'
      }

      const { error: statusUpdateError } = await supabase.from('projects').update({
        status: newStatus
      }).eq('id', project.id)

      if (statusUpdateError) {
        console.error('Failed to update project status:', statusUpdateError)
        return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 })
      }

      // Notify (non-blocking) - use appropriate notification based on outcome
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const notificationOptions = {
        projectId: project.id,
        projectTitle: project.book_title,
        authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
        projectUrl: `${baseUrl}/admin/project/${project.id}`,
      }

      if (hasFeedback) {
        notifyIllustrationFeedback(notificationOptions).catch(e => console.error('Notification error:', e))
      } else {
        notifyIllustrationsApproved(notificationOptions).catch(e => console.error('Notification error:', e))
      }

      return NextResponse.json({
        success: true,
        message,
        status: newStatus
      })
    }

    // BRANCH 2: CHARACTER REVIEW SUBMISSION (Existing Logic)
    // ... page edits (manuscript) are shared? 
    // Actually, customer might edit manuscript during character review. 
    // We should allow pageEdits in both modes? 
    // User request: "Cusromers will also Have the add review botton... similar to character revision section"
    // Usually focus is on Illustration but manuscript edits might happen.
    // Existing logic processes pageEdits at the top. Let's keep that shared.

    // Update pages with customer edits (Shared)
    if (pageEdits && Object.keys(pageEdits).length > 0) {
      const pageUpdates = Object.entries(pageEdits).map(([pageId, edits]: [string, any]) => ({
        id: pageId,
        story_text: edits.story_text,
        scene_description: edits.scene_description,
        is_customer_edited_story_text: !!edits.story_text && edits.story_text !== '',
        is_customer_edited_scene_description: !!edits.scene_description && edits.scene_description !== '',
      }))

      for (const update of pageUpdates) {
        const { error: updateError } = await supabase
          .from('pages')
          .update({
            story_text: update.story_text,
            scene_description: update.scene_description,
            is_customer_edited_story_text: update.is_customer_edited_story_text,
            is_customer_edited_scene_description: update.is_customer_edited_scene_description,
          })
          .eq('id', update.id)

        if (updateError) {
          console.error(`Error updating page ${update.id}:`, updateError)
        }
      }
    }

    // Update characters with customer edits
    const { characterEdits } = body
    if (characterEdits && Object.keys(characterEdits).length > 0) {


      const characterUpdates = Object.entries(characterEdits).map(([charId, data]: [string, any]) => ({
        id: charId,
        data: data
      }))

      await Promise.all(characterUpdates.map(async (update) => {
        const { error: updateError } = await supabase
          .from('characters')
          .update({
            age: update.data.age,
            gender: update.data.gender,
            skin_color: update.data.skin_color,
            hair_color: update.data.hair_color,
            hair_style: update.data.hair_style,
            eye_color: update.data.eye_color,
            clothing: update.data.clothing,
            accessories: update.data.accessories,
            special_features: update.data.special_features,
          })
          .eq('id', update.id)

        if (updateError) {
          console.error(`Error updating character ${update.id}:`, updateError)
        }
      }))
    }

    // Fetch characters to determine flow (Generation vs Revision vs Approval)
    // Fetch characters to determine flow (Generation vs Revision vs Approval)
    // Re-fetch to ensure we have the latest edits from the transaction above
    const { data: latestCharacters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)

    if (charsError || !latestCharacters) {
      console.error('Error fetching characters:', charsError)
      return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 })
    }

    // Determine Logic Flow
    // 1. Generation Needed? (Any secondary character missing image)
    const secondaryCharacters = latestCharacters.filter(c => !c.is_main)
    const pendingGeneration = secondaryCharacters.some(c => !c.image_url || c.image_url.trim() === '')

    // 2. Feedback Present? (Any character has NOTES and is NOT resolved)
    // Note: We check ALL characters for feedback, including Main.
    const hasFeedback = latestCharacters.some(c => !!c.feedback_notes && !c.is_resolved)

    console.log('[Form Submit] Decision Tree:', {
      secondaryCount: secondaryCharacters.length,
      pendingGeneration,
      hasFeedback,
      secondaryWithoutImages: secondaryCharacters.filter(c => !c.image_url || c.image_url.trim() === '').length
    })

    // DECISION TREE
    if (pendingGeneration) {
      // PATH A: GENERATION REQUIRED
      // Update project status to generating
      await supabase.from('projects').update({ status: 'character_generation' }).eq('id', project.id)

      // Send notification with character data (non-blocking)
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      notifyCustomerSubmission({
        projectId: project.id,
        projectTitle: project.book_title,
        authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
        projectUrl: `${baseUrl}/admin/project/${project.id}`,
        characters: secondaryCharacters.map(c => ({
          name: c.name,
          role: c.role,
          age: c.age,
          gender: c.gender,
          description: c.description,
          skin_color: c.skin_color,
          hair_color: c.hair_color,
          hair_style: c.hair_style,
          eye_color: c.eye_color,
          clothing: c.clothing,
          accessories: c.accessories,
          special_features: c.special_features,
        })),
      }).catch(e => console.error('Notification error:', e))

      // Fire-and-forget generation
      const charactersToGenerate = secondaryCharacters.filter(c => !c.image_url || c.image_url.trim() === '')
      console.log('[Form Submit] Characters to generate:', charactersToGenerate.length)
      if (charactersToGenerate.length > 0) {
        (async () => {
          try {
            console.log('[Bg Generation] Starting background generation for', charactersToGenerate.length, 'characters')
            const { generateCharacterImage } = await import('@/lib/ai/character-generator')
            const mainChar = latestCharacters.find(c => c.is_main)
            const mainCharImage = mainChar?.image_url || ''
            console.log('[Bg Generation] Main character image:', mainCharImage ? 'EXISTS' : 'MISSING')

            // Run in parallel with timeout logging
            console.log('[Bg Generation] Calling generateCharacterImage for each character...')
            const results = await Promise.all(
              charactersToGenerate.map((char, idx) => {
                console.log(`[Bg Generation] Starting generation for character ${idx + 1}: ${char.name || char.role}`)
                return generateCharacterImage(char, mainCharImage, project.id)
                  .then(result => {
                    console.log(`[Bg Generation] Character ${idx + 1} completed:`, result.success ? 'SUCCESS' : 'FAILED')
                    return result
                  })
                  .catch(err => {
                    console.error(`[Bg Generation] Character ${idx + 1} ERROR:`, err)
                    throw err
                  })
              })
            )
            console.log('[Bg Generation] All characters processed')

            // If successful, update status to complete
            const allSucceeded = results.every(r => r.success)
            if (allSucceeded) {
              const supabaseAdmin = await createAdminClient()
              await supabaseAdmin.from('projects').update({ status: 'character_generation_complete' }).eq('id', project.id)

              // Trigger sketch generation for main character (already has colored image)
              const mainChar = latestCharacters.find(c => c.is_main)
              console.log('[Form Submit] Main character for sketch:', mainChar ? `ID: ${mainChar.id}, has image: ${!!mainChar.image_url}` : 'NOT FOUND')
              if (mainChar?.image_url) {
                console.log('[Form Submit] Triggering main character sketch generation...')
                // Call shared sketch generation function (async fire-and-forget)
                ;(async () => {
                  const { generateCharacterSketch } = await import('@/lib/ai/character-sketch-generator')
                  await generateCharacterSketch(
                    mainChar.id,
                    mainChar.image_url,
                    project.id,
                    mainChar.name || mainChar.role || 'Main Character'
                  )
                })()
              } else {
                console.log('[Form Submit] Skipping main character sketch (no image_url)')
              }

              // Trigger sketch generation for secondary characters (newly generated colored images)
              console.log('[Form Submit] Triggering sketch generation for', results.length, 'secondary characters...')
              results.forEach((result, idx) => {
                if (result.success && result.imageUrl) {
                  const character = charactersToGenerate[idx]
                  console.log(`[Form Submit] Starting sketch for secondary character ${idx + 1}: ${character.name || character.role}`)
                  
                  // Fire-and-forget async sketch generation
                  ;(async () => {
                    const { generateCharacterSketch } = await import('@/lib/ai/character-sketch-generator')
                    await generateCharacterSketch(
                      character.id,
                      result.imageUrl,
                      project.id,
                      character.name || character.role || 'Character'
                    )
                  })().catch(err => {
                    console.error(`[Form Submit] Secondary character sketch failed for ${character.name}:`, err)
                  })
                } else {
                  console.log(`[Form Submit] Skipping sketch for character ${idx + 1} (generation failed or no image)`)
                }
              })
            }

            // Notification logic...
            try {
              const { notifyCharacterGenerationComplete } = await import('@/lib/notifications')
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
              await notifyCharacterGenerationComplete({
                projectId: project.id,
                projectTitle: project.book_title,
                authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
                projectUrl: `${baseUrl}/admin/project/${project.id}`,
                generatedCount: results.filter(r => r.success).length,
                failedCount: results.filter(r => !r.success).length,
              })
            } catch (e) {
              console.error('Error sending completion notification', e)
            }

          } catch (err: any) { 
            console.error('[Bg Generation] CRITICAL ERROR:', err)
            console.error('[Bg Generation] Error stack:', err?.stack)
            console.error('[Bg Generation] Error message:', err?.message)
          }
        })().catch(err => {
          console.error('[Bg Generation] Unhandled rejection:', err)
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Changes submitted and generation started',
        status: 'character_generation'
      })

    } else {
      // PATH B: NO GENERATION NEEDED (Revision or Approval)
      let newStatus = 'characters_approved'
      let message = 'Characters approved successfully'

      if (hasFeedback) {
        newStatus = 'character_revision_needed'
        message = 'Feedback submitted successfully'
      }

      await supabase.from('projects').update({ status: newStatus }).eq('id', project.id)

      // Notify Admin (non-blocking)
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      notifyCustomerSubmission({
        projectId: project.id,
        projectTitle: project.book_title,
        authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
        projectUrl: `${baseUrl}/admin/project/${project.id}`,
      }).catch(e => console.error('Notification error:', e))

      return NextResponse.json({
        success: true,
        message,
        status: newStatus
      })
    }
  } catch (error: any) {
    console.error('Error submitting changes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit changes' },
      { status: 500 }
    )
  }
}











