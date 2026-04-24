import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { Cover } from '@/types/cover'

/**
 * POST /api/covers/revert
 *
 * Rollback helper for "Keep OLD" action in the comparison view. Writes a
 * previously-saved URL back into `{side}_url`. Validates that the URL belongs
 * to this project's cover storage prefix to prevent arbitrary-URL smuggling.
 */
export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const body = await request.json().catch(() => null) as {
            coverId?: string
            side?: 'front' | 'back'
            url?: string
        } | null

        if (!body || !body.coverId || (body.side !== 'front' && body.side !== 'back') || !body.url) {
            return NextResponse.json(
                { error: 'Missing or invalid fields: coverId, side, url' },
                { status: 400 }
            )
        }

        const { coverId, side, url } = body

        const supabase = createAdminClient()

        const { data: cover, error: lookupErr } = await supabase
            .from('covers')
            .select('*')
            .eq('id', coverId)
            .maybeSingle()

        if (lookupErr) {
            return NextResponse.json({ error: lookupErr.message }, { status: 500 })
        }
        if (!cover) {
            return NextResponse.json({ error: 'Cover not found' }, { status: 404 })
        }

        // Prevent arbitrary URL smuggling — the URL must live under this
        // project's covers/ storage prefix. Works regardless of CDN prefix
        // because public URLs always contain the project path.
        const expectedPrefixFragment = `/${cover.project_id}/covers/`
        if (!url.includes(expectedPrefixFragment)) {
            return NextResponse.json(
                { error: 'URL does not belong to this project\'s cover storage' },
                { status: 400 }
            )
        }

        const patch = side === 'front'
            ? { front_url: url, updated_at: new Date().toISOString() }
            : { back_url: url, updated_at: new Date().toISOString() }

        const { data: updated, error: updateErr } = await supabase
            .from('covers')
            .update(patch)
            .eq('id', coverId)
            .select('*')
            .single()

        if (updateErr || !updated) {
            return NextResponse.json(
                { error: updateErr?.message || 'Failed to revert cover' },
                { status: 500 }
            )
        }

        return NextResponse.json({ cover: updated as Cover })
    } catch (error: unknown) {
        console.error('[Cover revert] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
