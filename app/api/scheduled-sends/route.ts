import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET: Fetch pending scheduled send for a project
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('scheduled_sends')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ scheduledSend: data })
  } catch (error) {
    console.error('Failed to fetch scheduled send:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// POST: Create a new scheduled send
export async function POST(request: NextRequest) {
  try {
    const { projectId, actionType, scheduledAt, personalNote } = await request.json()

    if (!projectId || !actionType || !scheduledAt) {
      return NextResponse.json(
        { error: 'projectId, actionType, and scheduledAt are required' },
        { status: 400 }
      )
    }

    if (!['send_characters', 'send_sketches'].includes(actionType)) {
      return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Cancel any existing pending sends for this project+action
    await supabase
      .from('scheduled_sends')
      .update({ status: 'cancelled' })
      .eq('project_id', projectId)
      .eq('action_type', actionType)
      .eq('status', 'pending')

    const insertData: Record<string, unknown> = {
      project_id: projectId,
      action_type: actionType,
      scheduled_at: scheduledAt,
    }
    if (personalNote?.trim()) insertData.personal_note = personalNote.trim()

    const { data, error } = await supabase
      .from('scheduled_sends')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ scheduledSend: data })
  } catch (error) {
    console.error('Failed to create scheduled send:', error)
    return NextResponse.json({ error: 'Failed to schedule' }, { status: 500 })
  }
}

// DELETE: Cancel a scheduled send
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const { error } = await supabase
      .from('scheduled_sends')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending')

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to cancel scheduled send:', error)
    return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  }
}
