import { openai } from '@/lib/ai/openai'
import { getErrorMessage } from '@/lib/utils/error'
import sharp from 'sharp'

interface CoverGenerateOptions {
    prompt: string
    referenceImageUrl: string
    bookAspectRatio: string | null | undefined
}

// Reuses the exact sizes from openai-illustration.ts for single-page covers.
// Constraints: ≤ 3,686,400 total pixels, both dimensions divisible by 16, exact book ratios.
function mapBookRatioToCoverSize(ratio: string | null | undefined): string {
    switch (ratio) {
        case '8:10':    return '1664x2080'  // 4:5 portrait
        case '8.5:8.5': return '1904x1904'  // 1:1 square
        case '8.5:11':  return '1632x2112'  // 17:22 portrait (≈3:4)
        default:        return '1904x1904'
    }
}

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string, data: string } | null> {
    try {
        let buffer: Buffer
        if (url.startsWith('data:')) {
            const m = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
            if (!m) return null
            buffer = Buffer.from(m[2], 'base64')
        } else {
            const res = await fetch(url)
            if (!res.ok) return null
            buffer = Buffer.from(await res.arrayBuffer())
        }
        try {
            const meta = await sharp(buffer).metadata()
            const fits = (meta.width ?? 0) <= 2048 && (meta.height ?? 0) <= 2048
            if (!fits) {
                buffer = await sharp(buffer).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
                return { mimeType: 'image/png', data: buffer.toString('base64') }
            }
            return { mimeType: meta.format === 'jpeg' ? 'image/jpeg' : 'image/png', data: buffer.toString('base64') }
        } catch {
            return { mimeType: 'image/png', data: buffer.toString('base64') }
        }
    } catch (e) {
        console.warn('[GPT2 Cover] Failed to fetch reference image:', e)
        return null
    }
}

export async function generateCover(
    opts: CoverGenerateOptions
): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {
    if (!openai) {
        return { success: false, imageBuffer: null, error: 'OpenAI API Key not configured' }
    }

    const { prompt, referenceImageUrl, bookAspectRatio } = opts
    const size = mapBookRatioToCoverSize(bookAspectRatio)
    console.log(`[GPT2 Cover] 📸 size=${size} ratio=${bookAspectRatio ?? 'default'}`)

    try {
        const refImg = await fetchImageAsBase64(referenceImageUrl)
        if (!refImg) {
            return { success: false, imageBuffer: null, error: 'Failed to fetch reference illustration' }
        }

        const content: any[] = [
            { type: 'input_text', text: 'REFERENCE ILLUSTRATION (from the book\'s interior — match this art style exactly):' },
            { type: 'input_image', image_url: `data:${refImg.mimeType};base64,${refImg.data}` },
            { type: 'input_text', text: prompt },
        ]

        const MAX_ATTEMPTS = 2
        let lastError = 'GPT-2 returned no image'

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`[GPT2 Cover] Attempt ${attempt}/${MAX_ATTEMPTS}...`)
            try {
                const response = await openai.responses.create({
                    model: 'gpt-5.4',
                    input: [{ role: 'user', content }],
                    tools: [{
                        type: 'image_generation',
                        model: 'gpt-image-2',
                        quality: 'high',
                        size,
                    } as any],
                })

                const imgOut = (response.output as any[]).find(o => o?.type === 'image_generation_call')
                if (imgOut?.result) {
                    console.log(`[GPT2 Cover] ✅ Image received (attempt ${attempt})`)
                    return {
                        success: true,
                        imageBuffer: Buffer.from(imgOut.result, 'base64'),
                        error: null,
                    }
                }
                lastError = 'GPT-2 response contained no image_generation_call output'
                console.warn(`[GPT2 Cover] ⚠️ No image on attempt ${attempt}`)
            } catch (apiErr: unknown) {
                lastError = getErrorMessage(apiErr)
                console.error(`[GPT2 Cover] ❌ API error on attempt ${attempt}: ${lastError}`)
                if (attempt < MAX_ATTEMPTS) {
                    await new Promise(r => setTimeout(r, 5000))
                }
            }
        }

        return { success: false, imageBuffer: null, error: lastError }
    } catch (error: unknown) {
        console.error('[GPT2 Cover] Fatal error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}
