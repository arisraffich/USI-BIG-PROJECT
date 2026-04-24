import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { buildCoverPrompt } from '@/lib/ai/cover-prompt'
import { generateCover } from '@/lib/ai/cover-generator'
import { Cover } from '@/types/cover'

export const maxDuration = 180

/**
 * POST /api/covers/generate
 *
 * Synchronous initial cover generation (front only). Blocks for ~60-120s.
 *
 * Flow:
 *   1. Verify project + source page + ensure no cover exists yet (UNIQUE enforced).
 *   2. Call GPT-2 (awaited).
 *   3. Upload PNG to illustrations/{projectId}/covers/front-{timestamp}.png.
 *   4. INSERT covers row with front_url + front_status='completed'.
 *   5. Return { cover }.
 *
 * No DB row is created until generation succeeds — failed attempts leave nothing behind.
 */
export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const body = await request.json().catch(() => null) as {
            projectId?: string
            sourcePageId?: string
            title?: string
            subtitle?: string
        } | null

        if (!body || !body.projectId || !body.sourcePageId || !body.title?.trim()) {
            return NextResponse.json(
                { error: 'Missing required fields: projectId, sourcePageId, title' },
                { status: 400 }
            )
        }

        const { projectId, sourcePageId } = body
        const title = body.title.trim()
        const subtitle = body.subtitle?.trim() || null

        const supabase = createAdminClient()

        // 1. Enforce UNIQUE(project_id) at the app layer with a clear error.
        const { data: existing, error: existingErr } = await supabase
            .from('covers')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle()

        if (existingErr) {
            console.error('[Cover generate] lookup error', existingErr)
            return NextResponse.json({ error: 'Database error' }, { status: 500 })
        }
        if (existing) {
            return NextResponse.json(
                { error: 'Cover already exists for this project. Delete the existing cover before creating a new one.' },
                { status: 409 }
            )
        }

        // 2. Fetch source page, verify ownership + illustration_url presence.
        const { data: page, error: pageErr } = await supabase
            .from('pages')
            .select('id, project_id, illustration_url')
            .eq('id', sourcePageId)
            .single()

        if (pageErr || !page) {
            console.error('[Cover generate] page not found', pageErr)
            return NextResponse.json({ error: 'Source page not found' }, { status: 404 })
        }
        if (page.project_id !== projectId) {
            return NextResponse.json({ error: 'Page does not belong to project' }, { status: 403 })
        }
        if (!page.illustration_url) {
            return NextResponse.json(
                { error: 'Selected page has no illustration yet' },
                { status: 400 }
            )
        }

        // 3. Fetch project for author + aspect ratio.
        const { data: project, error: projErr } = await supabase
            .from('projects')
            .select('id, author_firstname, author_lastname, illustration_aspect_ratio')
            .eq('id', projectId)
            .single()

        if (projErr || !project) {
            console.error('[Cover generate] project not found', projErr)
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const author = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim()
        if (!author) {
            return NextResponse.json(
                { error: 'Project is missing author name' },
                { status: 400 }
            )
        }

        // 4. Build prompt + generate (sync, awaited).
        const prompt = buildCoverPrompt({
            aspectRatio: project.illustration_aspect_ratio,
            title,
            subtitle,
            author,
        })

        console.log(`[Cover generate] project=${projectId} page=${sourcePageId} ratio=${project.illustration_aspect_ratio}`)

        const result = await generateCover({
            prompt,
            referenceImageUrl: page.illustration_url,
            bookAspectRatio: project.illustration_aspect_ratio,
        })

        if (!result.success || !result.imageBuffer) {
            return NextResponse.json(
                { error: result.error || 'Cover generation failed' },
                { status: 502 }
            )
        }

        // 5. Upload to storage.
        const timestamp = Date.now()
        const storagePath = `${projectId}/covers/front-${timestamp}.png`

        const { error: uploadErr } = await supabase.storage
            .from('illustrations')
            .upload(storagePath, result.imageBuffer, {
                contentType: 'image/png',
                upsert: false,
            })

        if (uploadErr) {
            console.error('[Cover generate] upload failed', uploadErr)
            return NextResponse.json(
                { error: `Storage upload failed: ${uploadErr.message}` },
                { status: 500 }
            )
        }

        const { data: urlData } = supabase.storage.from('illustrations').getPublicUrl(storagePath)
        const frontUrl = urlData.publicUrl

        // 6. Insert covers row (UNIQUE constraint is our race-condition safety net).
        const { data: cover, error: insertErr } = await supabase
            .from('covers')
            .insert({
                project_id: projectId,
                title,
                subtitle,
                source_page_id: sourcePageId,
                front_url: frontUrl,
                front_status: 'completed',
                back_status: 'pending',
            })
            .select('*')
            .single()

        if (insertErr || !cover) {
            console.error('[Cover generate] insert failed', insertErr)
            // Best-effort: clean up the uploaded file so we don't leave an orphan.
            await supabase.storage.from('illustrations').remove([storagePath]).catch(() => {})
            return NextResponse.json(
                { error: insertErr?.message || 'Failed to save cover record' },
                { status: 500 }
            )
        }

        return NextResponse.json({ cover: cover as Cover })
    } catch (error: unknown) {
        console.error('[Cover generate] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
