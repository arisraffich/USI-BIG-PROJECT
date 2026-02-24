import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'
import { notifyProjectSentToCustomer } from '@/lib/notifications'
import { getErrorMessage } from '@/lib/utils/error'

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
      .select('id, status, review_token, book_title, author_firstname, author_lastname, author_email, author_phone, character_send_count, illustration_send_count')
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

    // DETERMINE MODE: Character Review vs Illustration (Sketches)
    const isIllustrationMode = [
      'characters_approved',
      'sketches_review', 'sketches_revision',
      'illustration_approved',
      // Legacy statuses (for migration compatibility)
      'trial_review', 'trial_revision', 'trial_approved',
      'illustrations_generating',
      'illustration_review', 'illustration_revision_needed'
    ].includes(project.status)

    if (isIllustrationMode) {
      // --- ILLUSTRATION REVIEW MODE ---
      
      // Get current send count FIRST (needed for revision_round tracking)
      const currentCount = (project as any).illustration_send_count || 0

      // 1. Get ALL Pages
      const { data: pages } = await supabase
        .from('pages')
        .select('*')
        .eq('project_id', id)
        .order('page_number', { ascending: true })

      let hasImages = false

      if (pages && pages.length > 0) {
        // 2. Process Sync & Resolve Feedback for EACH page
        const updates = pages.map(async (page) => {
          const hasPageImages = !!(page.illustration_url || page.sketch_url)
          if (hasPageImages) hasImages = true

          // Resolve Feedback Logic
          const updateData: any = {}
          
          // If page has admin_reply, DON'T resolve - customer needs to see the reply first
          // Only resolve if there's feedback but NO admin_reply (meaning admin regenerated instead of replying)
          if (page.feedback_notes && !page.admin_reply) {
            const currentHistory = Array.isArray(page.feedback_history) ? page.feedback_history : []
            // Store revision_round: the NEW count (after this send completes)
            // This marks which "resend cycle" this feedback was resolved in
            const newHistory = [
              ...currentHistory,
              { 
                note: page.feedback_notes, 
                created_at: new Date().toISOString(),
                revision_round: currentCount + 1  // The round being completed now
              }
            ]
            updateData.feedback_history = newHistory
            updateData.feedback_notes = null
            updateData.is_resolved = false
          }
          // If page has admin_reply, keep feedback_notes and is_resolved=false so customer can see the reply

          // Sync Images (Ensure customer sees latest generated versions)
          // We only sync if there is a URL.
          if (page.illustration_url) updateData.customer_illustration_url = page.illustration_url
          if (page.sketch_url) updateData.customer_sketch_url = page.sketch_url

          if (Object.keys(updateData).length > 0) {
            await supabase.from('pages').update(updateData).eq('id', page.id)
          }
        })
        await Promise.all(updates)
      }

      // 3. Update Project Status & Count
      const newCount = hasImages ? currentCount + 1 : currentCount
      
      // Simplified: Always set to sketches_review (no trial phase)
      const newStatus = 'sketches_review'

      const { error: updateError } = await supabase
        .from('projects')
        .update({
          status: newStatus,
          review_token: reviewToken,
          illustration_send_count: newCount
        })
        .eq('id', id)

      if (updateError) throw updateError

      // 4. Notify
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const reviewUrl = `${baseUrl}/review/${reviewToken}?tab=illustrations`
      const projectUrl = `${baseUrl}/admin/project/${id}`

      if (project.author_email) {
        const authorName = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer'
        const projectTitle = project.book_title || 'Untitled Project'
        
        if (currentCount === 0) {
          // First send: All sketches ready
          const { notifyAllSketchesSent } = await import('@/lib/notifications')
          notifyAllSketchesSent({
            projectTitle,
            authorName,
            authorEmail: project.author_email,
            authorPhone: project.author_phone || undefined,
            reviewUrl,
            projectUrl,
          }).catch(err => console.error('Notification error:', err))
        } else {
          // Subsequent sends: Revisions
          const { notifyIllustrationsUpdate } = await import('@/lib/notifications')
          notifyIllustrationsUpdate({
            projectTitle,
            authorName,
            authorEmail: project.author_email,
            authorPhone: project.author_phone || undefined,
            reviewUrl,
            projectUrl,
            revisionRound: currentCount, // Revision round (currentCount=1 means 1st revision)
          }).catch(err => console.error('Notification error:', err))
        }
      }

      return NextResponse.json({
        success: true,
        reviewUrl,
        reviewToken,
        message: 'Illustrations sent to customer successfully',
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
        .select('id, feedback_notes, feedback_history, is_resolved, image_url, sketch_url, is_main')
        .eq('project_id', id)

      const hasImages = characters?.some(c => c.image_url && c.image_url.trim() !== '' && !c.is_main) || false
      

      if (characters) {
        // Process each character: resolve feedback AND sync customer_image_url
        console.log('[Send Characters] Processing', characters.length, 'characters')
        
        const charUpdates = characters.map(async (char) => {
          const updateData: any = {}
          
          console.log(`[Send Characters] Character ${char.id}:`, {
            has_image_url: !!char.image_url,
            has_sketch_url: !!char.sketch_url,
            is_main: char.is_main
          })
          
          // Resolve feedback if exists
          if (char.feedback_notes) {
            const currentHistory = Array.isArray(char.feedback_history) ? char.feedback_history : []
            const newHistory = [
              ...currentHistory,
              { note: char.feedback_notes, created_at: new Date().toISOString() }
            ]
            updateData.feedback_history = newHistory
            updateData.feedback_notes = null
            updateData.is_resolved = false
          }
          
          // Sync customer_image_url and customer_sketch_url (mirrors illustration approach)
          // Customer should see the latest admin-approved images
          if (char.image_url) {
            updateData.customer_image_url = char.image_url
            console.log(`[Send Characters] ? Will sync customer_image_url for ${char.id}`)
          }
          if (char.sketch_url) {
            updateData.customer_sketch_url = char.sketch_url
            console.log(`[Send Characters] ? Will sync customer_sketch_url for ${char.id}`)
          }
          
          // Only update if there's something to update
          if (Object.keys(updateData).length > 0) {
            console.log(`[Send Characters] Updating character ${char.id} with:`, Object.keys(updateData))
            const result = await supabase.from('characters').update(updateData).eq('id', char.id)
            if (result.error) {
              console.error(`[Send Characters] ? Error updating ${char.id}:`, result.error)
            } else {
              console.log(`[Send Characters] ? Successfully updated ${char.id}`)
            }
            return result
          }
          console.log(`[Send Characters] ?? Skipping ${char.id} - nothing to update`)
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
        // Fix: Use the NEW count to determine stage.
        // If we found images (hasImages=true), we incremented the count in DB above.
        // We must reflect that here.
        const currentCount = project.character_send_count || 0
        const newCount = hasImages ? currentCount + 1 : currentCount

        console.log('[Send to Customer] Email decision:', {
          hasImages,
          currentCount,
          newCount,
          authorEmail: project.author_email,
          willSendStage1: newCount === 0,
          willSendStage2: newCount === 1,
          willSendStage3Revision: newCount >= 2
        })

        // Determine which email template to use
        if (newCount >= 2) {
          // Stage 3: Revisions (Resend 1, 2, 3...)
          const revisionRound = newCount - 1 // Round 1 = 2nd send, Round 2 = 3rd send, etc.
          console.log('[Send to Customer] ? Triggering Stage 3 email (Character Revisions Round', revisionRound, ')')
          const { notifyCharacterRevisions } = await import('@/lib/notifications')
          notifyCharacterRevisions({
            projectTitle: project.book_title || 'Untitled Project',
            authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer',
            authorEmail: project.author_email,
            reviewUrl,
            projectUrl,
            revisionRound,
          }).catch((error) => console.error('[Send to Customer] ❌ Error sending Stage 3 notifications:', error))
        } else if (newCount === 1) {
          // Stage 2: First-time characters ready
          const { notifySecondaryCharactersReady } = await import('@/lib/notifications')
          notifySecondaryCharactersReady({
            projectTitle: project.book_title || 'Untitled Project',
            authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer',
            authorEmail: project.author_email,
            reviewUrl,
            projectUrl,
          }).catch((error) => console.error('[Send to Customer] ❌ Error sending Stage 2 notifications:', error))
        } else {
          // Stage 1: Initial Definition (Count remains 0)
          notifyProjectSentToCustomer({
            projectTitle: project.book_title || 'Untitled Project',
            authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer',
            authorEmail: project.author_email,
            authorPhone: project.author_phone || undefined,
            reviewUrl,
            projectUrl,
          }).catch((error) => console.error('[Send to Customer] ❌ Error sending Stage 1 notifications:', error))
        }
      } else {
        console.warn('[Send to Customer] ?? No author_email found, skipping notifications')
      }

      return NextResponse.json({
        success: true,
        reviewUrl,
        reviewToken,
        message: 'Project sent to customer review successfully',
      })
    }


  } catch (error: unknown) {
    console.error('Error sending project to customer:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to send project to customer') },
      { status: 500 }
    )
  }
}











