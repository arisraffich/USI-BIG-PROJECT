import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'

/**
 * DELETE /api/covers/[coverId]
 *
 * Full wipe. Deletes the covers row (admin confirms via client dialog first)
 * and makes a best-effort attempt to clean up storage files in
 * `illustrations/{projectId}/covers/`. Orphaned files, if any, are harmless.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ coverId: string }> }
) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const { coverId } = await params
        if (!coverId) {
            return NextResponse.json({ error: 'Cover ID required' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Look up project_id so we know which storage prefix to clean.
        const { data: cover, error: lookupErr } = await supabase
            .from('covers')
            .select('id, project_id')
            .eq('id', coverId)
            .maybeSingle()

        if (lookupErr) {
            console.error('[Cover DELETE] lookup error', lookupErr)
            return NextResponse.json({ error: lookupErr.message }, { status: 500 })
        }
        if (!cover) {
            return NextResponse.json({ error: 'Cover not found' }, { status: 404 })
        }

        // Delete the DB row first; storage cleanup is best-effort.
        const { error: deleteErr } = await supabase
            .from('covers')
            .delete()
            .eq('id', coverId)

        if (deleteErr) {
            console.error('[Cover DELETE] delete error', deleteErr)
            return NextResponse.json({ error: deleteErr.message }, { status: 500 })
        }

        // Best-effort storage cleanup. Any failure here is logged and ignored —
        // an orphaned file in storage is harmless and cheaper than blocking
        // delete on transient storage errors.
        try {
            const prefix = `${cover.project_id}/covers`
            const { data: files } = await supabase.storage
                .from('illustrations')
                .list(prefix, { limit: 100 })

            if (files && files.length > 0) {
                const paths = files.map(f => `${prefix}/${f.name}`)
                await supabase.storage.from('illustrations').remove(paths)
            }
        } catch (cleanupErr) {
            console.warn('[Cover DELETE] storage cleanup warning:', cleanupErr)
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error('[Cover DELETE] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
