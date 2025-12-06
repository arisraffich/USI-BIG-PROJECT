import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'
import { notifyProjectSentToCustomer } from '@/lib/notifications'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Get project to check current status and ensure it exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status, review_token, book_title, author_firstname, author_lastname, author_email, author_phone')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // If already in review, just return the existing review URL (allow resending)
    // Only block if already in generation or beyond
    if (project.status === 'character_generation') {
      return NextResponse.json(
        { error: 'Project is already being processed' },
        { status: 400 }
      )
    }

    // Generate review token if it doesn't exist
    let reviewToken = project.review_token
    if (!reviewToken) {
      reviewToken = uuidv4().replace(/-/g, '').substring(0, 32)
    }

    // Get all pages for this project to store original text
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, story_text, scene_description')
      .eq('project_id', id)

    if (pagesError) {
      console.error('Error fetching pages:', pagesError)
    }

    // Update project status to character_review and ensure review_token exists
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        status: 'character_review',
        review_token: reviewToken,
      })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating project:', updateError)
      return NextResponse.json(
        { error: 'Failed to update project' },
        { status: 500 }
      )
    }

    // Store original text for all pages (only if not already set)
    if (pages && pages.length > 0) {
      const updatePromises = pages.map(async (page) => {
        // Only update if original_story_text is not already set
        const { data: existingPage } = await supabase
          .from('pages')
          .select('original_story_text')
          .eq('id', page.id)
          .single()

        if (!existingPage?.original_story_text) {
          return supabase
            .from('pages')
            .update({
              original_story_text: page.story_text || '',
              original_scene_description: page.scene_description || null,
            })
            .eq('id', page.id)
        }
        return Promise.resolve({ error: null })
      })

      await Promise.all(updatePromises)
    }

    // Generate review URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const reviewUrl = `${baseUrl}/review/${reviewToken}`
    const projectUrl = `${baseUrl}/admin/project/${id}`

    // Send notifications (don't await - send in background)
    console.log(`[Send to Customer] Sending notifications for project ${id}`)
    console.log(`[Send to Customer] Customer email: ${project.author_email || 'not provided'}`)
    console.log(`[Send to Customer] Customer phone: ${project.author_phone || 'not provided'}`)
    
    // Only send notifications if customer email is available
    if (!project.author_email) {
      console.warn(`[Send to Customer] No customer email found for project ${id}, skipping notifications`)
    } else {
      notifyProjectSentToCustomer({
        projectTitle: project.book_title || 'Untitled Project',
        authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer',
        authorEmail: project.author_email,
        authorPhone: project.author_phone || undefined,
        reviewUrl,
        projectUrl,
      }).catch((error) => {
      console.error('[Send to Customer] Error sending notifications:', error)
      console.error('[Send to Customer] Error details:', {
        message: error.message,
        stack: error.stack,
      })
      // Don't fail the request if notification fails
      })
    }

    return NextResponse.json({
      success: true,
      reviewUrl,
      reviewToken,
      message: 'Project sent to customer review successfully',
    })
  } catch (error: any) {
    console.error('Error sending project to customer:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send project to customer' },
      { status: 500 }
    )
  }
}






