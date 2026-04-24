import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { Cover } from '@/types/cover'

/**
 * GET /api/projects/[id]/cover
 *
 * Returns { cover: Cover | null }. Never 404 on "no cover yet" — the client
 * branches on `cover === null` to render the empty state.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const { id: projectId } = await params
        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
        }

        const supabase = createAdminClient()

        const { data: cover, error } = await supabase
            .from('covers')
            .select('*')
            .eq('project_id', projectId)
            .maybeSingle()

        if (error) {
            console.error('[Cover GET] DB error', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ cover: (cover as Cover | null) ?? null })
    } catch (error: unknown) {
        console.error('[Cover GET] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
