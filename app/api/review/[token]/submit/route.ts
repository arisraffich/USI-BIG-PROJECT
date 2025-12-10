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

    // Fetch characters to determine flow (Generation vs Revision vs Approval)
    const { data: characters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)

    if (charsError) {
      console.error('Error fetching characters:', charsError)
      return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 })
    }

    // Check if secondary characters have images (excluding Main Character)
    const charsToValidate = characters?.filter(c => !c.is_main) || []
    const pendingGeneration = charsToValidate.some(c => !c.image_url || c.image_url.trim() === '')
    const hasFeedback = characters?.some(c => c.feedback_notes && !c.is_resolved) || false

    // SCENARIO A: Revision or Approval (No pending generation for secondary characters)
    if (!pendingGeneration) {
      let newStatus = 'characters_approved'
      let message = 'Characters approved successfully'

      if (hasFeedback) {
        newStatus = 'character_revision_needed'
        message = 'Feedback submitted successfully'
      }

      const { error: statusError } = await supabase
        .from('projects')
        .update({ status: newStatus })
        .eq('id', project.id)

      if (statusError) {
        console.error('Error updating status:', statusError)
        throw new Error('Failed to update project status')
      }

      // Notify Admin
      try {
        await notifyCustomerSubmission({
          projectId: project.id,
          projectTitle: project.book_title,
          authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
          projectUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/project/${project.id}`,
        })
      } catch (notifError) {
        console.error('Error sending notification:', notifError)
      }

      return NextResponse.json({
        success: true,
        message,
        status: newStatus
      })
    }

    // SCENARIO B: First Time Generation (No images yet)
    // Proceed with existing generation logic

    // Update project status to generating
    await supabase.from('projects').update({ status: 'character_generation' }).eq('id', project.id)

    // Send notification for generation start (non-blocking)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const projectUrl = `${baseUrl}/admin/project/${project.id}`

    try {
      await notifyCustomerSubmission({
        projectId: project.id,
        projectTitle: project.book_title,
        authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
        projectUrl,
      })
    } catch (notifError) {
      console.error('Error sending notification:', notifError)
    }

    // Identify/Generate secondary characters (Wait, logic usually generates ALL characters including Main?)
    // Existing logic fetched "secondary" only? 
    // "Get ALL secondary characters for generation" - Line 76 of original.
    // If we only generate secondary, what about main? 
    // Assuming Main is handled separately or this is a specific flow. 
    // I will stick to "Generate secondary" as per original logic, but double check if Main needs generation.
    // If Main has no image, we should probably generate it too?
    // But original code filtered `is_main: false`. 
    // I will respect original logic for now to avoid breaking Generation.

    const secondaryCharacters = characters.filter(c => !c.is_main)

    if (secondaryCharacters.length > 0) {
      // Fire-and-forget generation (Do not await)
      (async () => {
        try {
          console.log('[Submit] Starting background generation for project:', project.id)
          // Import generator dynamically
          const { generateCharacterImage } = await import('@/lib/ai/character-generator')

          // Get main character image for style reference if available
          const mainCharacter = characters.find(c => c.is_main)
          const mainCharImage = mainCharacter?.image_url || ''

          // Run in parallel
          const results = await Promise.all(
            secondaryCharacters.map(char => generateCharacterImage(char, mainCharImage, project.id))
          )

          console.log('[Submit] Background generation finished. Success count:', results.filter(r => r.success).length)

          // If successful, update status to complete (Stage 2)
          const allSucceeded = results.every(r => r.success)
          if (allSucceeded) {
            const supabaseAdmin = await createAdminClient() // Create fresh client for background task
            await supabaseAdmin
              .from('projects')
              .update({ status: 'character_generation_complete' }) // Maps to "Characters Generated"
              .eq('id', project.id)
          }

          // Notify completion
          try {
            const { notifyCharacterGenerationComplete } = await import('@/lib/notifications')
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
            const projectUrl = `${baseUrl}/admin/project/${project.id}`

            await notifyCharacterGenerationComplete({
              projectId: project.id,
              projectTitle: project.book_title,
              authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
              projectUrl,
              generatedCount: results.filter(r => r.success).length,
              failedCount: results.filter(r => !r.success).length,
            })
          } catch (e) {
            console.error('Error sending completion notification', e)
          }
        } catch (err) {
          console.error('[Submit] Background generation failed:', err)
        }
      })()
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






