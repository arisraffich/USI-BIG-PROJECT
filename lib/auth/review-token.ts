import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function getReviewToken(request: NextRequest, body?: { reviewToken?: unknown }): string | null {
  const headerToken = request.headers.get('x-review-token')
  if (headerToken?.trim()) return headerToken.trim()

  const queryToken = request.nextUrl.searchParams.get('reviewToken')
  if (queryToken?.trim()) return queryToken.trim()

  if (typeof body?.reviewToken === 'string' && body.reviewToken.trim()) {
    return body.reviewToken.trim()
  }

  return null
}

export function reviewUnauthorized(message = 'Invalid or missing review token') {
  return NextResponse.json({ error: message }, { status: 403 })
}

export async function verifyReviewTokenForProject(
  supabase: SupabaseClient,
  projectId: string,
  token: string | null
): Promise<boolean> {
  if (!projectId || !token) return false

  const { data: project, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('review_token', token)
    .maybeSingle()

  return !error && !!project
}

export async function verifyReviewTokenForPage(
  supabase: SupabaseClient,
  pageId: string,
  token: string | null
): Promise<boolean> {
  if (!pageId || !token) return false

  const { data: page, error: pageError } = await supabase
    .from('pages')
    .select('project_id')
    .eq('id', pageId)
    .maybeSingle()

  if (pageError || !page?.project_id) return false
  return verifyReviewTokenForProject(supabase, page.project_id, token)
}

export async function verifyReviewTokenForCharacter(
  supabase: SupabaseClient,
  characterId: string,
  token: string | null
): Promise<boolean> {
  if (!characterId || !token) return false

  const { data: character, error: characterError } = await supabase
    .from('characters')
    .select('project_id')
    .eq('id', characterId)
    .maybeSingle()

  if (characterError || !character?.project_id) return false
  return verifyReviewTokenForProject(supabase, character.project_id, token)
}
