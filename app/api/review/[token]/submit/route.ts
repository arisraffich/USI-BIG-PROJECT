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
    if (project.status !== 'character_review') {
      return NextResponse.json(
        { error: 'Project has already been submitted' },
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

    // Get ALL secondary characters for generation (regenerate ensuring consistency)
    const { data: secondaryCharacters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_main', false)

    if (charsError) {
      console.error('Error fetching characters:', charsError)
    }

    // Update project status
    const { error: statusError } = await supabase
      .from('projects')
      .update({ status: 'character_generation' })
      .eq('id', project.id)

    if (statusError) {
      console.error('Error updating project status:', statusError)
    }

    // Send notification (non-blocking)
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

    // Generate characters synchronously (awaiting results)
    const generationResults = []
    if (secondaryCharacters && secondaryCharacters.length > 0) {
      // Import generator dynamically or use top-level if possible
      const { generateCharacterImage } = await import('@/lib/ai/character-generator')

      // Get main character for context/style if needed (though Flux ignores img input currently, we pass it for future proofing)
      const { data: mainCharacter } = await supabase
        .from('characters')
        .select('*')
        .eq('project_id', project.id)
        .eq('is_main', true)
        .single()

      const mainCharImage = mainCharacter?.image_url || ''

      // Run in parallel
      const results = await Promise.all(
        secondaryCharacters.map(char => generateCharacterImage(char, mainCharImage, project.id))
      )

      generationResults.push(...results)

      // If successful, update status to complete
      const allSucceeded = results.every(r => r.success)
      if (allSucceeded) {
        await supabase
          .from('projects')
          .update({ status: 'character_generation_complete' })
          .eq('id', project.id)
      }

      // Notify completion
      try {
        const { notifyCharacterGenerationComplete } = await import('@/lib/notifications')
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
    }

    return NextResponse.json({
      success: true,
      message: 'Changes submitted and characters generated successfully',
      generated: generationResults.length,
      results: generationResults
    })
  } catch (error: any) {
    console.error('Error submitting changes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit changes' },
      { status: 500 }
    )
  }
}






