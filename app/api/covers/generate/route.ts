import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { buildCoverPrompt } from '@/lib/ai/cover-prompt'
import { generateCover } from '@/lib/ai/cover-generator'

export const maxDuration = 180

export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const body = await request.json().catch(() => null) as {
            projectId?: string
            pageId?: string
            title?: string
            subtitle?: string
        } | null

        if (!body || !body.projectId || !body.pageId || !body.title?.trim()) {
            return NextResponse.json(
                { error: 'Missing required fields: projectId, pageId, title' },
                { status: 400 }
            )
        }

        const { projectId, pageId } = body
        const title = body.title.trim()
        const subtitle = body.subtitle?.trim() || null

        const supabase = createAdminClient()

        // 1. Fetch page, verify ownership + illustration_url presence.
        const { data: page, error: pageErr } = await supabase
            .from('pages')
            .select('id, project_id, illustration_url')
            .eq('id', pageId)
            .single()

        if (pageErr || !page) {
            console.error('[Cover] page not found', pageErr)
            return NextResponse.json({ error: 'Page not found' }, { status: 404 })
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

        // 2. Fetch project for author + aspect ratio.
        const { data: project, error: projErr } = await supabase
            .from('projects')
            .select('id, author_firstname, author_lastname, illustration_aspect_ratio')
            .eq('id', projectId)
            .single()

        if (projErr || !project) {
            console.error('[Cover] project not found', projErr)
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const author = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim()
        if (!author) {
            return NextResponse.json(
                { error: 'Project is missing author name' },
                { status: 400 }
            )
        }

        // 3. Build prompt + generate.
        const prompt = buildCoverPrompt({
            aspectRatio: project.illustration_aspect_ratio,
            title,
            subtitle,
            author,
        })

        console.log(`[Cover] Generating: project=${projectId} page=${pageId} ratio=${project.illustration_aspect_ratio}`)

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

        return new NextResponse(new Uint8Array(result.imageBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Content-Length': result.imageBuffer.length.toString(),
                'Cache-Control': 'no-store',
            },
        })
    } catch (error: unknown) {
        console.error('[Cover] Fatal error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
