import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Silent Push to Customer
 * 
 * Syncs admin's illustration/sketch URLs to customer fields WITHOUT:
 * - Sending email notifications
 * - Sending Slack notifications
 * - Changing project status
 * - Incrementing send count
 * 
 * Use case: Admin finds an issue after sending and wants to silently fix it
 * before customer reviews.
 */
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

    // Get project to verify it exists and is in illustration mode
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status, illustration_send_count')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Only allow push if illustrations have been sent at least once
    if (!project.illustration_send_count || project.illustration_send_count < 1) {
      return NextResponse.json(
        { error: 'Cannot push - illustrations have not been sent to customer yet' },
        { status: 400 }
      )
    }

    // Get ALL Pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, illustration_url, sketch_url')
      .eq('project_id', id)
      .order('page_number', { ascending: true })

    if (pagesError) {
      return NextResponse.json(
        { error: 'Failed to fetch pages' },
        { status: 500 }
      )
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        { error: 'No pages found for this project' },
        { status: 400 }
      )
    }

    // Sync URLs for all pages (simple copy, no feedback resolution)
    let updatedCount = 0
    const updates = pages.map(async (page) => {
      const updateData: Record<string, string> = {}

      // Only sync if there's a URL to sync
      if (page.illustration_url) {
        updateData.customer_illustration_url = page.illustration_url
      }
      if (page.sketch_url) {
        updateData.customer_sketch_url = page.sketch_url
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('pages')
          .update(updateData)
          .eq('id', page.id)
        
        if (!error) updatedCount++
        return { pageId: page.id, success: !error }
      }
      return { pageId: page.id, success: true, skipped: true }
    })

    await Promise.all(updates)

    return NextResponse.json({
      success: true,
      message: `Pushed ${updatedCount} page(s) to customer silently`,
      updatedCount,
    })

  } catch (error: any) {
    console.error('Error pushing to customer:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to push to customer' },
      { status: 500 }
    )
  }
}
