import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for AI character identification
export const dynamic = 'force-dynamic'

/**
 * GET: Fetch existing secondary characters (no AI, just DB lookup).
 * Used when the wizard reloads and needs to restore character state.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: characters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_main', false)
      .order('name', { ascending: true })

    if (charsError) {
      console.error('[GetCharacters] Error fetching characters:', charsError)
    }

    return NextResponse.json({
      success: true,
      characters: characters || [],
      count: (characters || []).length,
    })
  } catch (error: unknown) {
    console.error('[GetCharacters] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to fetch characters') },
      { status: 500 }
    )
  }
}

/**
 * POST: Trigger AI character identification for the customer submission wizard.
 * Uses the existing identifyCharactersForProject function.
 * Returns the list of identified secondary characters.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Find project and verify status
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Accept both awaiting_customer_input (initial) and character_review (if re-triggered)
    const validStatuses = ['awaiting_customer_input', 'character_review']
    if (!validStatuses.includes(project.status)) {
      return NextResponse.json({ error: 'Project is not accepting submissions' }, { status: 403 })
    }

    console.log(`[IdentifyCharacters] Starting for project ${project.id}`)

    // Use the existing character identification function
    const { identifyCharactersForProject } = await import('@/app/api/ai/identify-characters/route')
    const result = await identifyCharactersForProject(project.id)

    // Fetch the full secondary characters (all fields for UniversalCharacterCard)
    const { data: characters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_main', false)
      .order('name', { ascending: true })

    if (charsError) {
      console.error('[IdentifyCharacters] Error fetching characters:', charsError)
    }

    const secondaryCharacters = characters || []
    console.log(`[IdentifyCharacters] Found ${secondaryCharacters.length} secondary characters for project ${project.id}`)

    return NextResponse.json({
      success: true,
      characters: secondaryCharacters,
      count: secondaryCharacters.length,
    })
  } catch (error: unknown) {
    console.error('[IdentifyCharacters] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to identify characters') },
      { status: 500 }
    )
  }
}
