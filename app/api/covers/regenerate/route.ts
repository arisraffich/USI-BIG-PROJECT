import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { buildCoverPrompt, buildBackCoverPrompt } from '@/lib/ai/cover-prompt'
import { generateCover, generateBackCover } from '@/lib/ai/cover-generator'
import { Cover } from '@/types/cover'

export const maxDuration = 180

// Hard cap on admin-attached reference images per the plan (§4.2).
const MAX_ADDED_IMAGES = 5

type Body = {
    coverId?: string
    side?: 'front' | 'back'
    // Front-only
    title?: string
    subtitle?: string
    sourcePageId?: string
    // Common
    instructions?: string
    addedImages?: string[]
}

function appendInstructions(prompt: string, instructions: string | null | undefined): string {
    const trimmed = instructions?.trim()
    if (!trimmed) return prompt
    return `${prompt}\n\nADMIN INSTRUCTIONS (take priority over any conflicting guidance above):\n${trimmed}`
}

/**
 * POST /api/covers/regenerate
 *
 * Sync regen for a single cover side (front or back). Matches §4.2 of the Cover Module plan.
 * Response shape: { cover, newUrl, oldUrl } — client drives the comparison view from oldUrl/newUrl.
 */
export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const body = await request.json().catch(() => null) as Body | null

        if (!body || !body.coverId || (body.side !== 'front' && body.side !== 'back')) {
            return NextResponse.json(
                { error: 'Missing or invalid fields: coverId, side' },
                { status: 400 }
            )
        }

        const { coverId, side } = body
        const addedImages = Array.isArray(body.addedImages) ? body.addedImages.slice(0, MAX_ADDED_IMAGES) : []
        const instructions = body.instructions?.trim() || null

        const supabase = createAdminClient()

        // 1. Load cover + project.
        const { data: cover, error: coverErr } = await supabase
            .from('covers')
            .select('*')
            .eq('id', coverId)
            .maybeSingle()

        if (coverErr) {
            console.error('[Cover regen] lookup error', coverErr)
            return NextResponse.json({ error: coverErr.message }, { status: 500 })
        }
        if (!cover) {
            return NextResponse.json({ error: 'Cover not found' }, { status: 404 })
        }

        const { data: project, error: projErr } = await supabase
            .from('projects')
            .select('id, author_firstname, author_lastname, illustration_aspect_ratio')
            .eq('id', cover.project_id)
            .single()

        if (projErr || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // 2. Branch on side.
        if (side === 'front') {
            const title = body.title?.trim()
            if (!title) {
                return NextResponse.json({ error: 'Title is required' }, { status: 400 })
            }
            const subtitle = body.subtitle?.trim() || null

            // Source page: either the new one admin picked, or keep the existing one.
            const sourcePageId = body.sourcePageId || cover.source_page_id
            if (!sourcePageId) {
                return NextResponse.json(
                    { error: 'No source page — pick an illustration to regenerate from' },
                    { status: 400 }
                )
            }

            const { data: page, error: pageErr } = await supabase
                .from('pages')
                .select('id, project_id, illustration_url')
                .eq('id', sourcePageId)
                .single()

            if (pageErr || !page) {
                return NextResponse.json({ error: 'Source page not found' }, { status: 404 })
            }
            if (page.project_id !== cover.project_id) {
                return NextResponse.json({ error: 'Source page does not belong to project' }, { status: 403 })
            }
            if (!page.illustration_url) {
                return NextResponse.json({ error: 'Source page has no illustration' }, { status: 400 })
            }

            const author = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim()
            if (!author) {
                return NextResponse.json({ error: 'Project is missing author name' }, { status: 400 })
            }

            const basePrompt = buildCoverPrompt({
                aspectRatio: project.illustration_aspect_ratio,
                title,
                subtitle,
                author,
            })
            const prompt = appendInstructions(basePrompt, instructions)

            console.log(`[Cover regen] FRONT cover=${coverId} sourcePage=${sourcePageId} extras=${addedImages.length}`)

            const result = await generateCover({
                prompt,
                referenceImageUrl: page.illustration_url,
                bookAspectRatio: project.illustration_aspect_ratio,
                additionalImageUrls: addedImages,
            })

            if (!result.success || !result.imageBuffer) {
                return NextResponse.json(
                    { error: result.error || 'Cover regeneration failed' },
                    { status: 502 }
                )
            }

            // Upload new front, keep old untouched so the client comparison can point at both.
            const timestamp = Date.now()
            const storagePath = `${cover.project_id}/covers/front-${timestamp}.png`

            const { error: uploadErr } = await supabase.storage
                .from('illustrations')
                .upload(storagePath, result.imageBuffer, {
                    contentType: 'image/png',
                    upsert: false,
                })

            if (uploadErr) {
                console.error('[Cover regen] upload failed', uploadErr)
                return NextResponse.json(
                    { error: `Storage upload failed: ${uploadErr.message}` },
                    { status: 500 }
                )
            }

            const { data: urlData } = supabase.storage.from('illustrations').getPublicUrl(storagePath)
            const newUrl = urlData.publicUrl
            const oldUrl: string | null = cover.front_url ?? null

            const { data: updated, error: updateErr } = await supabase
                .from('covers')
                .update({
                    title,
                    subtitle,
                    source_page_id: sourcePageId,
                    front_url: newUrl,
                    front_status: 'completed',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', coverId)
                .select('*')
                .single()

            if (updateErr || !updated) {
                console.error('[Cover regen] update failed', updateErr)
                await supabase.storage.from('illustrations').remove([storagePath]).catch(() => {})
                return NextResponse.json(
                    { error: updateErr?.message || 'Failed to save cover update' },
                    { status: 500 }
                )
            }

            return NextResponse.json({
                cover: updated as Cover,
                newUrl,
                oldUrl,
            })
        }

        // ---------- BACK ----------
        if (!cover.front_url) {
            return NextResponse.json(
                { error: 'Generate the front cover first — back cover uses it as its reference.' },
                { status: 400 }
            )
        }

        const basePrompt = buildBackCoverPrompt({ aspectRatio: project.illustration_aspect_ratio })
        const prompt = appendInstructions(basePrompt, instructions)

        console.log(`[Cover regen] BACK cover=${coverId} extras=${addedImages.length}`)

        const result = await generateBackCover({
            prompt,
            frontCoverUrl: cover.front_url,
            bookAspectRatio: project.illustration_aspect_ratio,
            additionalImageUrls: addedImages,
        })

        if (!result.success || !result.imageBuffer) {
            return NextResponse.json(
                { error: result.error || 'Back cover generation failed' },
                { status: 502 }
            )
        }

        const timestamp = Date.now()
        const storagePath = `${cover.project_id}/covers/back-${timestamp}.png`

        const { error: uploadErr } = await supabase.storage
            .from('illustrations')
            .upload(storagePath, result.imageBuffer, {
                contentType: 'image/png',
                upsert: false,
            })

        if (uploadErr) {
            console.error('[Cover regen] upload failed', uploadErr)
            return NextResponse.json(
                { error: `Storage upload failed: ${uploadErr.message}` },
                { status: 500 }
            )
        }

        const { data: urlData } = supabase.storage.from('illustrations').getPublicUrl(storagePath)
        const newUrl = urlData.publicUrl
        const oldUrl: string | null = cover.back_url ?? null

        const { data: updated, error: updateErr } = await supabase
            .from('covers')
            .update({
                back_url: newUrl,
                back_status: 'completed',
                updated_at: new Date().toISOString(),
            })
            .eq('id', coverId)
            .select('*')
            .single()

        if (updateErr || !updated) {
            console.error('[Cover regen] update failed', updateErr)
            await supabase.storage.from('illustrations').remove([storagePath]).catch(() => {})
            return NextResponse.json(
                { error: updateErr?.message || 'Failed to save cover update' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            cover: updated as Cover,
            newUrl,
            oldUrl,
        })
    } catch (error: unknown) {
        console.error('[Cover regen] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
