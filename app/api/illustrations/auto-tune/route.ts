import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/server'
import { tuneIllustration } from '@/lib/image/auto-tune'
import { getErrorMessage } from '@/lib/utils/error'
import type { ImageTuneSettings } from '@/types/image-tune'

export const maxDuration = 120

export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const { action = 'apply', projectId, pageId, settings } = await request.json() as {
            action?: 'apply'
            projectId?: string
            pageId?: string
            settings?: Partial<ImageTuneSettings>
        }

        if (action !== 'apply') {
            return NextResponse.json({ error: 'Unsupported tune action' }, { status: 400 })
        }

        if (!projectId || !pageId) {
            return NextResponse.json({ error: 'Missing projectId or pageId' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const { data: page, error: pageError } = await supabase
            .from('pages')
            .select('id, project_id, page_number, illustration_url')
            .eq('id', pageId)
            .single()

        if (pageError || !page) {
            return NextResponse.json({ error: pageError?.message || 'Page not found' }, { status: 404 })
        }

        if (page.project_id !== projectId) {
            return NextResponse.json({ error: 'Page does not belong to this project' }, { status: 400 })
        }

        const sourceUrl = page.illustration_url
        if (!sourceUrl) {
            return NextResponse.json({ error: 'No illustration available to auto tune' }, { status: 400 })
        }

        const sourceResponse = await fetch(sourceUrl)
        if (!sourceResponse.ok) {
            return NextResponse.json({ error: 'Failed to fetch source illustration' }, { status: 502 })
        }

        const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer())
        const tunedBuffer = await tuneIllustration(sourceBuffer, settings)
        const storagePath = `${projectId}/illustrations/page-${page.page_number}-tune-${Date.now()}.jpg`

        const { error: uploadError } = await supabase.storage
            .from('illustrations')
            .upload(storagePath, tunedBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true,
            })

        if (uploadError) {
            return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
        }

        const { data: { publicUrl } } = supabase.storage
            .from('illustrations')
            .getPublicUrl(storagePath)

        return NextResponse.json({
            success: true,
            illustrationUrl: publicUrl,
            pageId,
            isPreview: true,
            isRefresh: true,
            isAutoTune: true,
        })
    } catch (error: unknown) {
        console.error('Illustration auto tune error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to auto tune illustration') },
            { status: 500 }
        )
    }
}
