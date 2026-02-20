import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { removeMetadata } from '@/lib/utils/metadata-cleaner'

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const ILLUSTRATION_MODEL = 'gemini-3-pro-image-preview'
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
]

const SKETCH_PROMPT = `Convert the illustration into a loose, natural pencil draft sketch with real pencil texture. 
Black and white only. Use rough graphite lines with visible grain, uneven pressure, slight wobble, and broken strokes. 
Include light construction lines, faint smudges, and subtle overlapping marks. 
No digital-looking smooth lines. No fills or gradients.

Preserve every character, pose, expression, and composition exactly, but make the linework look hand-drawn with a physical pencil on paper.

ABSOLUTE FIDELITY RULES — NO EXCEPTIONS:

1. Do NOT add, invent, or complete any element that does not exist in the original illustration. 
   Do NOT infer or reconstruct hidden or partially obscured body parts. 
   If something is not visible in the original image, it must NOT appear in the sketch. 
   No extra hands, limbs, fingers, objects, lines, shadows, or background details may be added. 
   Zero new visual information may be introduced.

2. Do NOT remove or omit any element from the original illustration. 
   Every visible detail in the source image must be present in the sketch. 
   Every contour, shape, object, background element, character detail, and texture must be fully represented. 
   Nothing may be skipped or simplified away.

3. The sketch must be a 1:1 structural replica of the original illustration. 
   Only the rendering style may change (from color to pencil). 
   All proportions, positions, shapes, silhouettes, overlaps, and compositions must remain identical.

The result must look like a faithful pencil-line tracing of the original image — only translated into a natural, hand-drawn pencil style, with no added or missing elements.`

export const maxDuration = 120

export async function POST(request: NextRequest) {
    try {
        const isAuthenticated = request.cookies.get('admin_session_v2')?.value === 'true'
        if (!isAuthenticated) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        const arrayBuffer = await file.arrayBuffer()
        let buffer = Buffer.from(arrayBuffer)

        // Resize for API (max 2048px, convert to PNG)
        buffer = await sharp(buffer)
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer()

        const base64 = buffer.toString('base64')
        const mimeType = 'image/png'

        const payload = {
            contents: [{
                parts: [
                    { text: SKETCH_PROMPT },
                    { inline_data: { mime_type: mimeType, data: base64 } }
                ]
            }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: { imageSize: '2K' }
            },
            safetySettings: SAFETY_SETTINGS
        }

        const MAX_ATTEMPTS = 3
        let lastError = 'No image generated'

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`[Line Art] Attempt ${attempt}/${MAX_ATTEMPTS}...`)

            const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const txt = await response.text()
                const isRetryable = response.status === 503 || response.status === 429
                lastError = `Google API ${response.status}: ${txt.substring(0, 200)}`
                console.error(`[Line Art] HTTP ${response.status} on attempt ${attempt}`)

                if (!isRetryable || attempt === MAX_ATTEMPTS) {
                    return NextResponse.json({ error: lastError }, { status: 502 })
                }
                await new Promise(r => setTimeout(r, 3000 * attempt))
                continue
            }

            const result = await response.json()
            const allParts = result.candidates?.[0]?.content?.parts || []
            const imagePart = allParts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
            const base64Image = imagePart?.inline_data?.data || imagePart?.inlineData?.data

            if (base64Image) {
                console.log(`[Line Art] Image received on attempt ${attempt}`)
                const rawBuffer = Buffer.from(base64Image, 'base64')
                const cleanBuffer = await removeMetadata(rawBuffer)
                const b64Result = cleanBuffer.toString('base64')
                return NextResponse.json({ success: true, imageBase64: b64Result })
            }

            const finishReason = result.candidates?.[0]?.finishReason
            const blockReason = result.promptFeedback?.blockReason
            lastError = `No image: finish=${finishReason}, block=${blockReason}`
            console.warn(`[Line Art] No image on attempt ${attempt}: ${lastError}`)

            if (finishReason === 'IMAGE_SAFETY' || blockReason) {
                return NextResponse.json({ error: 'Image was blocked by safety filters. Try a different illustration.' }, { status: 422 })
            }

            if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 3000 * attempt))
            }
        }

        return NextResponse.json({ error: lastError }, { status: 502 })

    } catch (error: unknown) {
        console.error('[Line Art] Error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
