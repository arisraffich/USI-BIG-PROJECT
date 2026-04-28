import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { buildCoverPrompt, buildFaithfulCoverPrompt } from '@/lib/ai/cover-prompt'
import { generateCover } from '@/lib/ai/cover-generator'
import { bufferToPngDataUrl, fileToImageDataUrl, normalizeCoverToolAspectRatio } from '@/lib/cover-tool/utils'

export const maxDuration = 180

export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const formData = await request.formData()
        const file = formData.get('file')
        const title = String(formData.get('title') || '').trim()
        const subtitle = String(formData.get('subtitle') || '').trim()
        const author = String(formData.get('author') || '').trim()

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Reference image is required' }, { status: 400 })
        }
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Reference must be an image file' }, { status: 400 })
        }
        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 })
        }
        if (!author) {
            return NextResponse.json({ error: 'Author is required' }, { status: 400 })
        }

        const reference = await fileToImageDataUrl(file)
        const aspectRatio = normalizeCoverToolAspectRatio(formData.get('aspectRatio'), reference.width, reference.height)

        const faithfulPrompt = buildFaithfulCoverPrompt({
            aspectRatio,
            title,
            subtitle: subtitle || null,
            author,
        })
        const designedPrompt = buildCoverPrompt({
            aspectRatio,
            title,
            subtitle: subtitle || null,
            author,
        })

        console.log(`[Cover Tool] front candidates title="${title}" ratio=${aspectRatio}`)

        const [faithfulResult, designedResult] = await Promise.all([
            generateCover({
                prompt: faithfulPrompt,
                referenceImageUrl: reference.dataUrl,
                bookAspectRatio: aspectRatio,
            }),
            generateCover({
                prompt: designedPrompt,
                referenceImageUrl: reference.dataUrl,
                bookAspectRatio: aspectRatio,
            }),
        ])

        if (!faithfulResult.success || !faithfulResult.imageBuffer || !designedResult.success || !designedResult.imageBuffer) {
            const errors = [
                !faithfulResult.success ? `Faithful: ${faithfulResult.error || 'failed'}` : null,
                !designedResult.success ? `Designed: ${designedResult.error || 'failed'}` : null,
            ].filter(Boolean).join('; ')
            return NextResponse.json({ error: errors || 'Cover generation failed' }, { status: 502 })
        }

        return NextResponse.json({
            aspectRatio,
            candidates: {
                faithful: { kind: 'faithful', label: 'Faithful Version', dataUrl: bufferToPngDataUrl(faithfulResult.imageBuffer) },
                designed: { kind: 'designed', label: 'Designed Version', dataUrl: bufferToPngDataUrl(designedResult.imageBuffer) },
            },
        })
    } catch (error: unknown) {
        console.error('[Cover Tool] front generation error:', error)
        const message = error instanceof Error ? error.message : 'Cover generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
