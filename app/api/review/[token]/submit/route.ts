import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCustomerSubmission } from '@/lib/notifications'
import { replicate } from '@/lib/ai/replicate'
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
    if (project.status !== 'character_review' && project.status !== 'character_revision_needed') {
      return NextResponse.json(
        { error: 'Project is not in review status' },
        { status: 403 }
      )
    }

    // Update pages with customer edits
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
      console.log('[Submit] Processing character edits:', Object.keys(characterEdits).length)

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

    console.log(`[Submit] Status Check - Pending Gen: ${pendingGeneration}, Has Feedback: ${hasFeedback}`)

    // DECISION TREE
    if (pendingGeneration) {
      // PATH A: GENERATION REQUIRED
      // Update project status to generating
      await supabase.from('projects').update({ status: 'character_generation' }).eq('id', project.id)

      // Send notification (non-blocking)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        await notifyCustomerSubmission({
          projectId: project.id,
          projectTitle: project.book_title,
          authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
          projectUrl: `${baseUrl}/admin/project/${project.id}`,
        })
      } catch (e) { console.error('Notification error:', e) }

      // Fire-and-forget generation
      const charactersToGenerate = secondaryCharacters.filter(c => !c.image_url || c.image_url.trim() === '')
      if (charactersToGenerate.length > 0) {
        (async () => {
          try {
            const { generateCharacterImage } = await import('@/lib/ai/character-generator')
            const mainChar = latestCharacters.find(c => c.is_main)
            const mainCharImage = mainChar?.image_url || ''

            // Run in parallel
            const results = await Promise.all(
              charactersToGenerate.map(char => generateCharacterImage(char, mainCharImage, project.id))
            )

            // If successful, update status to complete
            const allSucceeded = results.every(r => r.success)
            if (allSucceeded) {
              const supabaseAdmin = await createAdminClient()
              await supabaseAdmin.from('projects').update({ status: 'character_generation_complete' }).eq('id', project.id)
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

          } catch (err) { console.error('Bg generation failed:', err) }
        })()
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

      // Notify Admin
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        await notifyCustomerSubmission({
          projectId: project.id,
          projectTitle: project.book_title,
          authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
          projectUrl: `${baseUrl}/admin/project/${project.id}`,
        })
      } catch (e) { console.error('Notification error:', e) }

      return NextResponse.json({
        success: true,
        message,
        status: newStatus
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Changes submitted and character generation started in background',
      processing_in_background: true
    })
  } catch (error: any) {
    console.error('Error submitting changes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit changes' },
      { status: 500 }
    )
  }
}






