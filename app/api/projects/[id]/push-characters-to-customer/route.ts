import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Silent Push Characters to Customer
 * 
 * Syncs admin's character image/sketch URLs to customer fields WITHOUT:
 * - Sending email notifications
 * - Sending Slack notifications
 * - Changing project status
 * - Incrementing send count
 * 
 * Use case: Admin uploads a new character image after sending and wants to 
 * silently update it before customer reviews.
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

    // Get project to verify it exists and characters have been sent
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status, character_send_count')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Only allow push if characters have been sent at least once
    if (!project.character_send_count || project.character_send_count < 1) {
      return NextResponse.json(
        { error: 'Cannot push - characters have not been sent to customer yet' },
        { status: 400 }
      )
    }

    // Get ALL Characters for this project
    const { data: characters, error: charactersError } = await supabase
      .from('characters')
      .select('id, image_url, sketch_url, name, is_main')
      .eq('project_id', id)
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true })

    if (charactersError) {
      return NextResponse.json(
        { error: 'Failed to fetch characters' },
        { status: 500 }
      )
    }

    if (!characters || characters.length === 0) {
      return NextResponse.json(
        { error: 'No characters found for this project' },
        { status: 400 }
      )
    }

    // Sync URLs for all characters (simple copy, no feedback resolution)
    let updatedCount = 0
    const updates = characters.map(async (char) => {
      const updateData: Record<string, string> = {}

      // Only sync if there's a URL to sync
      if (char.image_url) {
        updateData.customer_image_url = char.image_url
      }
      if (char.sketch_url) {
        updateData.customer_sketch_url = char.sketch_url
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('characters')
          .update(updateData)
          .eq('id', char.id)
        
        if (!error) updatedCount++
        return { characterId: char.id, name: char.name, success: !error }
      }
      return { characterId: char.id, name: char.name, success: true, skipped: true }
    })

    await Promise.all(updates)

    return NextResponse.json({
      success: true,
      message: `Pushed ${updatedCount} character(s) to customer silently`,
      updatedCount,
    })

  } catch (error: any) {
    console.error('Error pushing characters to customer:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to push characters to customer' },
      { status: 500 }
    )
  }
}
