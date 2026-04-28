import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { buildBackCoverPrompt } from '@/lib/ai/cover-prompt'
import { generateBackCover } from '@/lib/ai/cover-generator'
import { bufferToPngDataUrl, fileToImageDataUrl, normalizeCoverToolAspectRatio } from '@/lib/cover-tool/utils'

export const maxDuration = 180

export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const formData = await request.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Selected front cover image is required' }, { status: 400 })
        }
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Front cover must be an image file' }, { status: 400 })
        }

        const front = await fileToImageDataUrl(file)
        const aspectRatio = normalizeCoverToolAspectRatio(formData.get('aspectRatio'), front.width, front.height)
        const prompt = buildBackCoverPrompt({ aspectRatio })

        console.log(`[Cover Tool] back cover ratio=${aspectRatio}`)

        const result = await generateBackCover({
            prompt,
            frontCoverUrl: front.dataUrl,
            bookAspectRatio: aspectRatio,
        })

        if (!result.success || !result.imageBuffer) {
            return NextResponse.json({ error: result.error || 'Back cover generation failed' }, { status: 502 })
        }

        return NextResponse.json({
            aspectRatio,
            backCover: { dataUrl: bufferToPngDataUrl(result.imageBuffer) },
        })
    } catch (error: unknown) {
        console.error('[Cover Tool] back generation error:', error)
        const message = error instanceof Error ? error.message : 'Back cover generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
