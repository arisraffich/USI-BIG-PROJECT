import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCustomerSubmission } from '@/lib/notifications'

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
      .select('id, book_title, author_firstname, author_lastname, status, review_token')
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
      'illustration_review', 'illustration_revision_needed'
    ]

    if (!allowedStatuses.includes(project.status)) {
      return NextResponse.json(
        { error: 'Project is not in a reviewable status' },
        { status: 403 }
      )
    }

    // BRANCH 1: ILLUSTRATION REVIEW SUBMISSION
    if (project.status.includes('illustration')) {
      const { illustrationEdits } = body

      // Fetch all pages to handle implicit resolution
      const { data: allPages } = await supabase
        .from('pages')
        .select('id, feedback_notes, is_resolved, feedback_history')
        .eq('project_id', project.id)

      if (allPages) {
        const editsMap = illustrationEdits || {}

        for (const p of allPages) {
          const edit = editsMap[p.id]

          if (edit !== undefined) {
            // User explicitly edited this page
            const hasNotes = !!edit && edit.trim() !== ''

            // If clearing notes (approving previously rejected page), strictly enable history move if needed?
            // Actually, if customer clears text, we just clear it. We don't archive "empty" notes.
            // But if they are replacing text, we overwrite.

            await supabase.from('pages').update({
              feedback_notes: hasNotes ? edit : null,
              is_resolved: !hasNotes
            }).eq('id', p.id)
          } else {
            // User did NOT edit this page. 
            // If it has pending notes, assume they are now approved/accepted as-is (Implicit Approval).
            if (p.feedback_notes && !p.is_resolved) {
              // Move to history and clear
              const newHistoryItem = {
                note: p.feedback_notes,
                date: new Date().toISOString(),
                status: 'resolved_by_customer_approval',
                source: 'customer'
              }

              const currentHistory = Array.isArray(p.feedback_history) ? p.feedback_history : []

              await supabase.from('pages').update({
                feedback_notes: null,
                is_resolved: true,
                feedback_history: [...currentHistory, newHistoryItem]
              }).eq('id', p.id)
            }
          }
        }
      }

      // Determine Outcome: Revision vs Approval
      // Check if ANY page has feedback notes (unresolved)
      const { data: pages } = await supabase.from('pages').select('feedback_notes, is_resolved').eq('project_id', project.id)
      const hasFeedback = pages?.some(p => !!p.feedback_notes && !p.is_resolved)

      let newStatus = 'illustration_approved'
      let message = 'Illustration trial approved!'

      if (hasFeedback) {
        newStatus = 'illustration_revision_needed'
        message = 'Feedback submitted. We will revise the illustration.'
      }

      await supabase.from('projects').update({
        status: newStatus,
        illustration_status: newStatus
      }).eq('id', project.id)

      // Notify (non-blocking)
      notifyCustomerSubmission({
        projectId: project.id,
        projectTitle: project.book_title,
        authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
        projectUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/project/${project.id}`,
      }).catch(e => console.error('Notification error:', e))

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
                // Call sketch generation directly (async fire-and-forget)
                ;(async () => {
                  try {
                    const { generateSketch } = await import('@/lib/ai/google-ai')
                    const { sanitizeFilename } = await import('@/lib/utils/metadata-cleaner')
                    
                    const prompt = `Convert the illustration into a loose, natural pencil draft sketch with real pencil texture. 
Black and white only. Use rough graphite lines with visible grain, uneven pressure, slight wobble, and broken strokes. 
Include light construction lines, faint smudges, and subtle overlapping marks. 
No digital-looking smooth lines. No fills or gradients.

Preserve every character, pose, expression, and composition exactly, but make the linework look hand-drawn with a physical pencil on paper.

ABSOLUTE FIDELITY RULES — NO EXCEPTIONS:

1. Do NOT add, invent, or complete any element that does not exist in the original illustration. 
2. Do NOT remove or omit any element from the original illustration. 
3. The sketch must be a 1:1 structural replica of the original illustration.`
                    
                    const result = await generateSketch(mainChar.image_url, prompt)
                    
                    if (result.success && result.imageBuffer) {
                      const timestamp = Date.now()
                      const characterName = sanitizeFilename(mainChar.name || mainChar.role || 'character')
                      const filename = `${project.id}/characters/${characterName}-sketch-${timestamp}.png`
                      
                      const supabaseAdmin = await createAdminClient()
                      const { error: uploadError } = await supabaseAdmin.storage
                        .from('character-sketches')
                        .upload(filename, result.imageBuffer, {
                          contentType: 'image/png',
                          upsert: true
                        })
                      
                      if (!uploadError) {
                        const { data: urlData } = supabaseAdmin.storage
                          .from('character-sketches')
                          .getPublicUrl(filename)
                        
                        await supabaseAdmin
                          .from('characters')
                          .update({
                            sketch_url: urlData.publicUrl,
                            sketch_prompt: prompt
                          })
                          .eq('id', mainChar.id)
                        
                        console.log('[Form Submit] ✅ Main character sketch generated successfully')
                      } else {
                        console.error('[Form Submit] Sketch upload error:', uploadError)
                      }
                    }
                  } catch (err) {
                    console.error('[Form Submit] Failed to generate main character sketch:', err)
                  }
                })()
              } else {
                console.log('[Form Submit] Skipping main character sketch (no image_url)')
              }
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






