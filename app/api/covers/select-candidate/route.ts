import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { Cover } from '@/types/cover'

export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const body = await request.json().catch(() => null) as {
            coverId?: string
            selectedStoragePath?: string
            rejectedStoragePaths?: string[]
        } | null

        if (!body?.coverId || !body.selectedStoragePath) {
            return NextResponse.json(
                { error: 'Missing required fields: coverId, selectedStoragePath' },
                { status: 400 }
            )
        }

        const supabase = createAdminClient()

        const { data: cover, error: coverErr } = await supabase
            .from('covers')
            .select('*')
            .eq('id', body.coverId)
            .maybeSingle()

        if (coverErr) {
            console.error('[Cover select] lookup error', coverErr)
            return NextResponse.json({ error: coverErr.message }, { status: 500 })
        }
        if (!cover) {
            return NextResponse.json({ error: 'Cover not found' }, { status: 404 })
        }

        const candidatePrefix = `${cover.project_id}/covers/candidates/`
        if (!body.selectedStoragePath.startsWith(candidatePrefix)) {
            return NextResponse.json({ error: 'Invalid candidate path' }, { status: 400 })
        }

        const selectedUrl = supabase.storage
            .from('illustrations')
            .getPublicUrl(body.selectedStoragePath).data.publicUrl

        const { data: updated, error: updateErr } = await supabase
            .from('covers')
            .update({
                front_url: selectedUrl,
                front_status: 'completed',
                updated_at: new Date().toISOString(),
            })
            .eq('id', body.coverId)
            .select('*')
            .single()

        if (updateErr || !updated) {
            console.error('[Cover select] update failed', updateErr)
            return NextResponse.json(
                { error: updateErr?.message || 'Failed to save selected cover' },
                { status: 500 }
            )
        }

        const rejected = Array.isArray(body.rejectedStoragePaths)
            ? body.rejectedStoragePaths.filter(path => path.startsWith(candidatePrefix) && path !== body.selectedStoragePath)
            : []

        if (rejected.length > 0) {
            const { error: removeErr } = await supabase.storage.from('illustrations').remove(rejected)
            if (removeErr) {
                console.warn('[Cover select] rejected candidate cleanup failed', removeErr)
            }
        }

        return NextResponse.json({ cover: updated as Cover })
    } catch (error: unknown) {
        console.error('[Cover select] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
