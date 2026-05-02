import { openai } from '@/lib/ai/openai'
import { getErrorMessage } from '@/lib/utils/error'
import sharp from 'sharp'
import { REFRESH_PROMPT } from '@/lib/ai/refresh-prompt'

interface CharacterReference {
    name: string
    imageUrl: string
    role?: string
    isMain?: boolean
}

interface GPT2GenerateOptions {
    prompt: string
    characterReferences?: CharacterReference[]
    anchorImage?: string | null
    styleReferenceImages?: string[]
    bookAspectRatio?: string | null
    isSpread?: boolean
    hasCustomStyleRefs?: boolean
    isRefresh?: boolean
    currentImageUrl?: string | null
}

// Safe GPT Image 2 size helper for arbitrary uploaded images.
// Constraints: max edge <= 3840, ratio <= 3:1, total pixels <= 8,294,400, dimensions divisible by 16.
function fitGpt2SizeToInputRatio(width: number, height: number): string {
    const MAX_PIXELS = 8_294_400
    const MAX_EDGE = 3840
    const MIN_PIXELS = 655_360
    const ratio = Math.max(1 / 3, Math.min(3, width / height))
    let outWidth = Math.sqrt(MAX_PIXELS * ratio)
    let outHeight = outWidth / ratio

    if (outWidth > MAX_EDGE) {
        outWidth = MAX_EDGE
        outHeight = outWidth / ratio
    }
    if (outHeight > MAX_EDGE) {
        outHeight = MAX_EDGE
        outWidth = outHeight * ratio
    }

    outWidth = Math.floor(outWidth / 16) * 16
    outHeight = Math.floor(outHeight / 16) * 16

    while (outWidth * outHeight > MAX_PIXELS) {
        if (outWidth >= outHeight) outWidth -= 16
        else outHeight -= 16
    }
    while (outWidth * outHeight < MIN_PIXELS) {
        if (outWidth <= outHeight && outWidth + 16 <= MAX_EDGE) outWidth += 16
        else if (outHeight + 16 <= MAX_EDGE) outHeight += 16
        else break
    }

    return `${Math.max(16, outWidth)}x${Math.max(16, outHeight)}`
}

// Safe (non-experimental) GPT Image 2 sizes.
// Project book ratios stay exact. Standalone tools may pass custom:W:H for uploaded-image remastering.
// Reference: https://platform.openai.com/docs/guides/image-generation (size constraints)
function mapBookRatioToGpt2Size(ratio: string | null | undefined, isSpread: boolean): string {
    if (ratio?.startsWith('custom:')) {
        const [, widthRaw, heightRaw] = ratio.split(':')
        const width = Number(widthRaw)
        const height = Number(heightRaw)
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return fitGpt2SizeToInputRatio(width, height)
        }
    }
    if (isSpread) {
        switch (ratio) {
            case '8:10': return '2304x1440'       // 8:5 spread (exact)
            case '8.5:8.5': return '2688x1344'    // 2:1 spread (exact)
            case '8.5:11': return '2176x1408'     // 17:11 spread (exact)
            default: return '2304x1440'
        }
    }
    switch (ratio) {
        case '8:10': return '1664x2080'           // 4:5 single (exact)
        case '8.5:8.5': return '1904x1904'        // 1:1 single (exact)
        case '8.5:11': return '1632x2112'         // 17:22 single (exact)
        default: return '1904x1904'
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
        console.warn('[GPT2 Illustration] Failed to fetch image:', e)
        return null
    }
}

export async function generateIllustrationGPT2(
    opts: GPT2GenerateOptions
): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {
    if (!openai) {
        return { success: false, imageBuffer: null, error: 'OpenAI API Key not configured' }
    }

    const {
        prompt,
        characterReferences = [],
        anchorImage,
        styleReferenceImages = [],
        bookAspectRatio,
        isSpread = false,
        hasCustomStyleRefs = false,
        isRefresh = false,
        currentImageUrl,
    } = opts

    const size = mapBookRatioToGpt2Size(bookAspectRatio, isSpread)
    console.log(`[GPT2 Illustration] 📸 size=${size} refresh=${isRefresh} chars=${characterReferences.length} anchor=${!!anchorImage} refs=${styleReferenceImages.length}`)

    try {
        const content: any[] = []

        if (isRefresh) {
            const refImageUrl = currentImageUrl || anchorImage
            if (!refImageUrl) {
                return { success: false, imageBuffer: null, error: 'Refresh requires current illustration URL' }
            }
            const img = await fetchImageAsBase64(refImageUrl)
            if (!img) {
                return { success: false, imageBuffer: null, error: 'Failed to fetch current illustration for refresh' }
            }
            content.push({ type: 'input_text', text: 'IMAGE 1: ORIGINAL ILLUSTRATION. This is the exact illustration to remaster. Preserve its composition, characters, poses, expressions, objects, background, perspective, and layout exactly:' })
            content.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.data}` })

            for (let i = 0; i < styleReferenceImages.length; i++) {
                const styleImg = await fetchImageAsBase64(styleReferenceImages[i])
                if (!styleImg) continue
                content.push({
                    type: 'input_text',
                    text: `IMAGE 2: STYLE REFERENCE. Use this image only for visual quality guidance: color palette, shades, tone, warmth/coolness, saturation, contrast, shading style, texture, line cleanliness, and rendering finish.
Do not copy its characters, objects, scene, background, composition, poses, typography, or story content.`
                })
                content.push({ type: 'input_image', image_url: `data:${styleImg.mimeType};base64,${styleImg.data}` })
            }

            if (styleReferenceImages.length > 0) {
                content.push({
                    type: 'input_text',
                    text: `IMAGE ROLE INSTRUCTION: IMAGE 1 controls the illustration content and layout. IMAGE 2 controls only the color, texture, tone, shading, and rendering quality.
The final result must be IMAGE 1 remastered with IMAGE 2's visual quality. Do not borrow content from IMAGE 2.`
                })
            }
            content.push({ type: 'input_text', text: prompt?.trim() || REFRESH_PROMPT })
        } else {
            // Standard generation: character refs + anchor + prompt
            const charFetches = await Promise.all(
                characterReferences.map(c => fetchImageAsBase64(c.imageUrl))
            )
            for (let i = 0; i < characterReferences.length; i++) {
                const char = characterReferences[i]
                const img = charFetches[i]
                if (!img) continue
                let label = `Reference image for character named "${char.name}"`
                if (char.role) label += ` (Role: ${char.role})`
                if (char.isMain && !hasCustomStyleRefs) {
                    label += ` [MAIN CHARACTER - MASTER STYLE REFERENCE]`
                    label += `\nINSTRUCTION: This image determines the VISUAL STYLE for the ENTIRE ILLUSTRATION.`
                    label += `\n- Apply the Art Style (Medium, Flatness, Texture) of this character to the BACKGROUND, TREES, and PROPS.`
                } else if (char.isMain && hasCustomStyleRefs) {
                    label += ` [MAIN CHARACTER - IDENTITY REFERENCE]`
                    label += `\nIMPORTANT: This image defines the CHARACTER'S APPEARANCE only. Style is defined by separate style references.`
                }
                label += ':'
                content.push({ type: 'input_text', text: label })
                content.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.data}` })
            }

            if (anchorImage) {
                const anchorImg = await fetchImageAsBase64(anchorImage)
                if (anchorImg) {
                    content.push({
                        type: 'input_text',
                        text: 'STYLE REFERENCE (Maintain the art style, lighting, and rendering of this reference):'
                    })
                    content.push({
                        type: 'input_image',
                        image_url: `data:${anchorImg.mimeType};base64,${anchorImg.data}`
                    })
                }
            }

            for (const styleUrl of styleReferenceImages) {
                const styleImg = await fetchImageAsBase64(styleUrl)
                if (!styleImg) continue
                content.push({ type: 'input_text', text: 'Additional Visual Reference:' })
                content.push({
                    type: 'input_image',
                    image_url: `data:${styleImg.mimeType};base64,${styleImg.data}`
                })
            }

            content.push({ type: 'input_text', text: prompt })
        }

        const MAX_ATTEMPTS = 2
        let lastError = 'GPT-2 returned no image'

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`[GPT2 Illustration] Attempt ${attempt}/${MAX_ATTEMPTS}...`)
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
                    console.log(`[GPT2 Illustration] ✅ Image received (attempt ${attempt})`)
                    return {
                        success: true,
                        imageBuffer: Buffer.from(imgOut.result, 'base64'),
                        error: null,
                    }
                }
                lastError = 'GPT-2 response contained no image_generation_call output'
                console.warn(`[GPT2 Illustration] ⚠️ No image on attempt ${attempt}`)
            } catch (apiErr: unknown) {
                lastError = getErrorMessage(apiErr)
                console.error(`[GPT2 Illustration] ❌ API error on attempt ${attempt}: ${lastError}`)
                if (attempt < MAX_ATTEMPTS) {
                    await new Promise(r => setTimeout(r, 5000))
                }
            }
        }

        return { success: false, imageBuffer: null, error: lastError }
    } catch (error: unknown) {
        console.error('[GPT2 Illustration] Fatal error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}
