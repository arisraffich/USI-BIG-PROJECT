import { openai } from '@/lib/ai/openai'
import { getErrorMessage } from '@/lib/utils/error'
import sharp from 'sharp'

interface CoverGenerateOptions {
    prompt: string
    referenceImageUrl: string
    bookAspectRatio: string | null | undefined
    /**
     * Optional additional images (data URLs or https URLs) appended after the
     * primary reference. Used for regen's "Add Images" field. Max 5 enforced
     * by the API layer.
     */
    additionalImageUrls?: string[]
    /**
     * Controls how the primary reference image is introduced to the model.
     * - 'source-page' (default): used for first-gen + regen when the admin
     *   picks a new source page. The reference is an interior illustration;
     *   the model is expected to redesign from it.
     * - 'current-cover': used for regen when the admin keeps the same source
     *   page. The reference IS the existing cover; the model must edit it
     *   in place instead of redesigning.
     */
    referenceMode?: 'source-page' | 'current-cover'
}

interface BackCoverGenerateOptions {
    prompt: string
    frontCoverUrl: string
    bookAspectRatio: string | null | undefined
    additionalImageUrls?: string[]
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

type GenResult = { success: boolean, imageBuffer: Buffer | null, error: string | null }

/**
 * Core GPT-2 image call. Used by both front and back cover generators.
 * `content` is the fully built multimodal payload; `tag` is a short label
 * for logs (e.g., "Front", "Back").
 */
async function runGpt2ImageCall(content: unknown[], size: string, tag: string): Promise<GenResult> {
    if (!openai) {
        return { success: false, imageBuffer: null, error: 'OpenAI API Key not configured' }
    }

    const MAX_ATTEMPTS = 2
    let lastError = 'GPT-2 returned no image'

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[GPT2 ${tag}] Attempt ${attempt}/${MAX_ATTEMPTS}...`)
        try {
            const response = await openai.responses.create({
                model: 'gpt-5.4',
                input: [{ role: 'user', content: content as any }],
                tools: [{
                    type: 'image_generation',
                    model: 'gpt-image-2',
                    quality: 'high',
                    size,
                } as any],
            })

            const imgOut = (response.output as any[]).find(o => o?.type === 'image_generation_call')
            if (imgOut?.result) {
                console.log(`[GPT2 ${tag}] ✅ Image received (attempt ${attempt})`)
                return {
                    success: true,
                    imageBuffer: Buffer.from(imgOut.result, 'base64'),
                    error: null,
                }
            }
            lastError = 'GPT-2 response contained no image_generation_call output'
            console.warn(`[GPT2 ${tag}] ⚠️ No image on attempt ${attempt}`)
        } catch (apiErr: unknown) {
            lastError = getErrorMessage(apiErr)
            console.error(`[GPT2 ${tag}] ❌ API error on attempt ${attempt}: ${lastError}`)
            if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 5000))
            }
        }
    }

    return { success: false, imageBuffer: null, error: lastError }
}

/**
 * Fetches an array of image URLs in parallel, returning only those that succeeded.
 * Used for the optional "Add Images" field on regen.
 */
async function fetchAdditionalReferences(urls: string[] | undefined): Promise<Array<{ mimeType: string, data: string }>> {
    if (!urls || urls.length === 0) return []
    const results = await Promise.all(urls.map(u => fetchImageAsBase64(u)))
    return results.filter((r): r is { mimeType: string, data: string } => r !== null)
}

export async function generateCover(opts: CoverGenerateOptions): Promise<GenResult> {
    if (!openai) {
        return { success: false, imageBuffer: null, error: 'OpenAI API Key not configured' }
    }

    const { prompt, referenceImageUrl, bookAspectRatio, additionalImageUrls, referenceMode = 'source-page' } = opts
    const size = mapBookRatioToCoverSize(bookAspectRatio)
    console.log(`[GPT2 Front] 📸 size=${size} ratio=${bookAspectRatio ?? 'default'} mode=${referenceMode} extras=${additionalImageUrls?.length ?? 0}`)

    try {
        const refImg = await fetchImageAsBase64(referenceImageUrl)
        if (!refImg) {
            return { success: false, imageBuffer: null, error: 'Failed to fetch reference image' }
        }

        const extras = await fetchAdditionalReferences(additionalImageUrls)

        const referencePreamble = referenceMode === 'current-cover'
            ? 'CURRENT FRONT COVER (the target image to edit — preserve composition, subjects, background, and style exactly; only apply the changes described in the prompt):'
            : 'REFERENCE ILLUSTRATION (from the book\'s interior — match this art style exactly):'

        const content: any[] = [
            { type: 'input_text', text: referencePreamble },
            { type: 'input_image', image_url: `data:${refImg.mimeType};base64,${refImg.data}` },
        ]

        if (extras.length > 0) {
            content.push({ type: 'input_text', text: 'ADDITIONAL REFERENCE IMAGES (supplementary inspiration only — the primary illustration above is the style anchor):' })
            for (const img of extras) {
                content.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.data}` })
            }
        }

        content.push({ type: 'input_text', text: prompt })

        return await runGpt2ImageCall(content, size, 'Front')
    } catch (error: unknown) {
        console.error('[GPT2 Front] Fatal error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}

export async function generateBackCover(opts: BackCoverGenerateOptions): Promise<GenResult> {
    if (!openai) {
        return { success: false, imageBuffer: null, error: 'OpenAI API Key not configured' }
    }

    const { prompt, frontCoverUrl, bookAspectRatio, additionalImageUrls } = opts
    const size = mapBookRatioToCoverSize(bookAspectRatio)
    console.log(`[GPT2 Back] 📸 size=${size} ratio=${bookAspectRatio ?? 'default'} extras=${additionalImageUrls?.length ?? 0}`)

    try {
        const frontImg = await fetchImageAsBase64(frontCoverUrl)
        if (!frontImg) {
            return { success: false, imageBuffer: null, error: 'Failed to fetch front cover as reference' }
        }

        const extras = await fetchAdditionalReferences(additionalImageUrls)

        const content: any[] = [
            { type: 'input_text', text: 'FRONT COVER (the primary reference — the back cover must match this style and visual world exactly):' },
            { type: 'input_image', image_url: `data:${frontImg.mimeType};base64,${frontImg.data}` },
        ]

        if (extras.length > 0) {
            content.push({ type: 'input_text', text: 'ADDITIONAL REFERENCE IMAGES (supplementary inspiration only):' })
            for (const img of extras) {
                content.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.data}` })
            }
        }

        content.push({ type: 'input_text', text: prompt })

        return await runGpt2ImageCall(content, size, 'Back')
    } catch (error: unknown) {
        console.error('[GPT2 Back] Fatal error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}
