import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { removeMetadata } from '@/lib/utils/metadata-cleaner'
import { processLineArtToTransparentPng, LINE_ART_PROMPT } from '@/lib/line-art/processor'

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
        const inputBuffer = Buffer.from(arrayBuffer)

        const buffer = await sharp(inputBuffer)
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer()

        const base64 = buffer.toString('base64')

        // Step 1: Generate line art via Gemini (same prompt as in-app pipeline)
        const payload = {
            contents: [{
                parts: [
                    { text: LINE_ART_PROMPT },
                    { inline_data: { mime_type: 'image/png', data: base64 } }
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
            console.log(`[Line Art Standalone] Attempt ${attempt}/${MAX_ATTEMPTS}...`)

            const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const txt = await response.text()
                const isRetryable = response.status === 503 || response.status === 429
                lastError = `Google API ${response.status}: ${txt.substring(0, 200)}`
                console.error(`[Line Art Standalone] HTTP ${response.status} on attempt ${attempt}`)

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
                console.log(`[Line Art Standalone] AI image received on attempt ${attempt}, running Potrace...`)
                const rawBuffer = Buffer.from(base64Image, 'base64')
                const cleanBuffer = await removeMetadata(rawBuffer)

                // Step 2: Potrace vectorize → transparent PNG @2x (same as in-app pipeline)
                const transparentPng = await processLineArtToTransparentPng(cleanBuffer)

                console.log(`[Line Art Standalone] Done. Output: ${(transparentPng.length / 1024).toFixed(1)} KB`)

                return new NextResponse(new Uint8Array(transparentPng), {
                    status: 200,
                    headers: {
                        'Content-Type': 'image/png',
                        'Content-Length': transparentPng.length.toString(),
                    },
                })
            }

            const finishReason = result.candidates?.[0]?.finishReason
            const blockReason = result.promptFeedback?.blockReason
            lastError = `No image: finish=${finishReason}, block=${blockReason}`
            console.warn(`[Line Art Standalone] No image on attempt ${attempt}: ${lastError}`)

            if (finishReason === 'IMAGE_SAFETY' || blockReason) {
                return NextResponse.json({ error: 'Image was blocked by safety filters. Try a different illustration.' }, { status: 422 })
            }

            if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 3000 * attempt))
            }
        }

        return NextResponse.json({ error: lastError }, { status: 502 })

    } catch (error: unknown) {
        console.error('[Line Art Standalone] Error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
