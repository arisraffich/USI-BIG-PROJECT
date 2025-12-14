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
      .select('id, status, review_token, book_title, author_firstname, author_lastname, author_email, author_phone, character_send_count')
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

    // DETERMINE MODE: Character Review vs Illustration Trial
    const isIllustrationMode = ['characters_approved', 'illustration_review', 'illustration_revision_needed'].includes(project.status)

    if (isIllustrationMode) {
      // --- ILLUSTRATION TRIAL MODE ---
      console.log(`[Send to Customer] Processing Illustration Trial for project ${id}`)

      // 1. Get Page 1 to check/resolve feedback
      const { data: page1 } = await supabase
        .from('pages')
        .select('id, feedback_notes, feedback_history, is_resolved, illustration_url, sketch_url')
        .eq('project_id', id)
        .eq('page_number', 1)
        .single()

      if (page1) {
        // Resolve feedback if exists (like characters)
        if (page1.feedback_notes) {
          console.log(`[Resend] Archiving feedback for Page 1`)
          const currentHistory = Array.isArray(page1.feedback_history) ? page1.feedback_history : []
          const newHistory = [
            ...currentHistory,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { note: page1.feedback_notes, created_at: new Date().toISOString() } as any
          ]

          await supabase
            .from('pages')
            .update({
              feedback_history: newHistory,
              feedback_notes: null,
              is_resolved: true
            })
            .eq('id', page1.id)
        }
      }

      // 2. Update Project Status & Count & SYNC IMAGES TO PATIENT
      const hasImages = !!(page1?.illustration_url || page1?.sketch_url)
      const currentCount = (project as any).illustration_send_count || 0

      // SYNC: Copy Draft -> Published
      // We do this for Page 1 (currently checking Page 1 for trial)
      if (page1) {
        await supabase.from('pages')
          .update({
            customer_illustration_url: page1.illustration_url,
            customer_sketch_url: page1.sketch_url
          })
          .eq('id', page1.id)
      }

      const { error: updateError } = await supabase
        .from('projects')
        .update({
          status: 'illustration_review', // Set to waiting for review
          review_token: reviewToken,
          illustration_send_count: hasImages ? currentCount + 1 : currentCount
        })
        .eq('id', id)

      if (updateError) throw updateError

      // 3. Notify
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const reviewUrl = `${baseUrl}/review/${reviewToken}?tab=illustrations`
      const projectUrl = `${baseUrl}/admin/project/${id}`

      if (project.author_email) {
        const { notifyIllustrationTrialSent } = await import('@/lib/notifications')
        notifyIllustrationTrialSent({
          projectTitle: project.book_title || 'Untitled Project',
          authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer',
          authorEmail: project.author_email,
          authorPhone: project.author_phone || undefined,
          reviewUrl,
          projectUrl,
        }).catch(err => console.error('Notification error:', err))
      }

      return NextResponse.json({
        success: true,
        reviewUrl,
        reviewToken,
        message: 'Illustration trial sent to customer successfully',
      })

    } else {
      // --- CHARACTER REVIEW MODE (Existing Logic) ---

      // Get all pages for this project to store original text (Legacy requirement for char review phase)
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('id, story_text, scene_description')
        .eq('project_id', id)

      if (pagesError) console.error('Error fetching pages:', pagesError)

      // Process "Resend" logic: Resolve feedback for regenerated characters
      const { data: characters } = await supabase
        .from('characters')
        .select('id, feedback_notes, feedback_history, is_resolved, image_url, is_main')
        .eq('project_id', id)

      const hasImages = characters?.some(c => c.image_url && c.image_url.trim() !== '' && !c.is_main) || false

      if (characters) {
        // ... (Keep existing character resolution logic)
        const charUpdates = characters.map(async (char) => {
          if (char.feedback_notes) {
            const currentHistory = Array.isArray(char.feedback_history) ? char.feedback_history : []
            const newHistory = [
              ...currentHistory,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { note: char.feedback_notes, created_at: new Date().toISOString() } as any
            ]
            return supabase.from('characters').update({
              feedback_history: newHistory,
              feedback_notes: null,
              is_resolved: true
            }).eq('id', char.id)
          }
          return Promise.resolve()
        })
        await Promise.all(charUpdates)
      }

      // Update project status to character_review
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          status: 'character_review',
          review_token: reviewToken,
          character_send_count: hasImages ? (project.character_send_count || 0) + 1 : (project.character_send_count || 0)
        })
        .eq('id', id)

      if (updateError) throw updateError

      // Store original text for all pages
      if (pages && pages.length > 0) {
        const updatePromises = pages.map(async (page) => {
          const { data: existingPage } = await supabase.from('pages').select('original_story_text').eq('id', page.id).single()
          if (!existingPage?.original_story_text) {
            return supabase.from('pages').update({
              original_story_text: page.story_text || '',
              original_scene_description: page.scene_description || null,
            }).eq('id', page.id)
          }
          return Promise.resolve({ error: null })
        })
        await Promise.all(updatePromises)
      }

      // Generate review URL
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const reviewUrl = `${baseUrl}/review/${reviewToken}?tab=characters`
      const projectUrl = `${baseUrl}/admin/project/${id}`

      // Send notifications
      if (project.author_email) {
        notifyProjectSentToCustomer({
          projectTitle: project.book_title || 'Untitled Project',
          authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer',
          authorEmail: project.author_email,
          authorPhone: project.author_phone || undefined,
          reviewUrl,
          projectUrl,
        }).catch((error) => console.error('[Send to Customer] Error sending notifications:', error))
      }

      return NextResponse.json({
        success: true,
        reviewUrl,
        reviewToken,
        message: 'Project sent to customer review successfully',
      })
    }


  } catch (error: any) {
    console.error('Error sending project to customer:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send project to customer' },
      { status: 500 }
    )
  }
}






