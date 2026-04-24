import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { buildCoverPrompt, buildFaithfulCoverPrompt } from '@/lib/ai/cover-prompt'
import { generateCover } from '@/lib/ai/cover-generator'
import { Cover, CoverCandidate } from '@/types/cover'

export const maxDuration = 180

/**
 * POST /api/covers/generate
 *
 * Synchronous initial cover generation (front only). Blocks while both
 * candidates generate in parallel.
 *
 * Flow:
 *   1. Verify project + source page + ensure no cover exists yet (UNIQUE enforced).
 *   2. Generate Faithful + Designed candidates in parallel.
 *   3. Upload both PNGs to temporary candidate storage paths.
 *   4. INSERT covers row with front_url=null + front_status='pending'.
 *   5. Return { cover, candidates } so admin can pick the official front cover.
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

        // 4. Build prompts + generate both candidates in parallel.
        const faithfulPrompt = buildFaithfulCoverPrompt({
            aspectRatio: project.illustration_aspect_ratio,
            title,
            subtitle,
            author,
        })
        const designedPrompt = buildCoverPrompt({
            aspectRatio: project.illustration_aspect_ratio,
            title,
            subtitle,
            author,
        })

        console.log(`[Cover generate] project=${projectId} page=${sourcePageId} ratio=${project.illustration_aspect_ratio} candidates=faithful,designed`)

        const [faithfulResult, designedResult] = await Promise.all([
            generateCover({
                prompt: faithfulPrompt,
                referenceImageUrl: page.illustration_url,
                bookAspectRatio: project.illustration_aspect_ratio,
            }),
            generateCover({
                prompt: designedPrompt,
                referenceImageUrl: page.illustration_url,
                bookAspectRatio: project.illustration_aspect_ratio,
            }),
        ])

        if (!faithfulResult.success || !faithfulResult.imageBuffer || !designedResult.success || !designedResult.imageBuffer) {
            const errors = [
                !faithfulResult.success ? `Faithful: ${faithfulResult.error || 'failed'}` : null,
                !designedResult.success ? `Designed: ${designedResult.error || 'failed'}` : null,
            ].filter(Boolean).join('; ')
            return NextResponse.json(
                { error: errors || 'Cover generation failed' },
                { status: 502 }
            )
        }

        // 5. Upload candidates to temporary storage paths. They become official
        // only after admin selects one in /api/covers/select-candidate.
        const timestamp = Date.now()
        const generationId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
        const faithfulPath = `${projectId}/covers/candidates/${generationId}/faithful.png`
        const designedPath = `${projectId}/covers/candidates/${generationId}/designed.png`

        const [faithfulUpload, designedUpload] = await Promise.all([
            supabase.storage.from('illustrations').upload(faithfulPath, faithfulResult.imageBuffer, {
                contentType: 'image/png',
                upsert: false,
            }),
            supabase.storage.from('illustrations').upload(designedPath, designedResult.imageBuffer, {
                contentType: 'image/png',
                upsert: false,
            }),
        ])

        if (faithfulUpload.error || designedUpload.error) {
            console.error('[Cover generate] candidate upload failed', faithfulUpload.error || designedUpload.error)
            await supabase.storage.from('illustrations').remove([faithfulPath, designedPath]).catch(() => {})
            return NextResponse.json(
                { error: `Storage upload failed: ${(faithfulUpload.error || designedUpload.error)?.message || 'unknown error'}` },
                { status: 500 }
            )
        }

        const faithfulUrl = supabase.storage.from('illustrations').getPublicUrl(faithfulPath).data.publicUrl
        const designedUrl = supabase.storage.from('illustrations').getPublicUrl(designedPath).data.publicUrl

        // 6. Insert covers row (UNIQUE constraint is our race-condition safety net).
        // The official front_url remains null until admin selects a candidate.
        const { data: cover, error: insertErr } = await supabase
            .from('covers')
            .insert({
                project_id: projectId,
                title,
                subtitle,
                source_page_id: sourcePageId,
                front_url: null,
                front_status: 'pending',
                back_status: 'pending',
            })
            .select('*')
            .single()

        if (insertErr || !cover) {
            console.error('[Cover generate] insert failed', insertErr)
            await supabase.storage.from('illustrations').remove([faithfulPath, designedPath]).catch(() => {})
            return NextResponse.json(
                { error: insertErr?.message || 'Failed to save cover record' },
                { status: 500 }
            )
        }

        const candidates: { faithful: CoverCandidate, designed: CoverCandidate } = {
            faithful: {
                kind: 'faithful',
                label: 'Faithful Version',
                url: faithfulUrl,
                storagePath: faithfulPath,
            },
            designed: {
                kind: 'designed',
                label: 'Designed Version',
                url: designedUrl,
                storagePath: designedPath,
            },
        }

        return NextResponse.json({ cover: cover as Cover, candidates })
    } catch (error: unknown) {
        console.error('[Cover generate] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
