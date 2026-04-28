import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireAdmin } from '@/lib/auth/admin'
import { openai } from '@/lib/ai/openai'
import { REFRESH_PROMPT } from '@/lib/ai/refresh-prompt'
import { bufferToPngDataUrl, fileToImageDataUrl } from '@/lib/cover-tool/utils'
import { removeMetadata } from '@/lib/utils/metadata-cleaner'

export const maxDuration = 240

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const GEMINI_SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
]

type RemasterModel = 'nb2' | 'nb-pro' | 'gpt-2'

function normalizeModel(value: FormDataEntryValue | null): RemasterModel {
    return value === 'nb-pro' || value === 'gpt-2' ? value : 'nb2'
}

function fitGpt2SizeToInputRatio(width: number, height: number): string {
    const maxPixels = 8_294_400
    const maxEdge = 3840
    const minPixels = 655_360
    const ratio = Math.max(1 / 3, Math.min(3, width / height))
    let outWidth = Math.sqrt(maxPixels * ratio)
    let outHeight = outWidth / ratio

    if (outWidth > maxEdge) {
        outWidth = maxEdge
        outHeight = outWidth / ratio
    }
    if (outHeight > maxEdge) {
        outHeight = maxEdge
        outWidth = outHeight * ratio
    }

    outWidth = Math.floor(outWidth / 16) * 16
    outHeight = Math.floor(outHeight / 16) * 16

    while (outWidth * outHeight > maxPixels) {
        if (outWidth >= outHeight) outWidth -= 16
        else outHeight -= 16
    }
    while (outWidth * outHeight < minPixels) {
        if (outWidth <= outHeight && outWidth + 16 <= maxEdge) outWidth += 16
        else if (outHeight + 16 <= maxEdge) outHeight += 16
        else break
    }

    return `${Math.max(16, outWidth)}x${Math.max(16, outHeight)}`
}

async function toPngDataUrl(buffer: Buffer): Promise<string> {
    try {
        const png = await sharp(buffer).png().toBuffer()
        return bufferToPngDataUrl(png)
    } catch {
        return bufferToPngDataUrl(buffer)
    }
}

function geminiModelId(model: RemasterModel): string {
    return model === 'nb-pro' ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview'
}

function extractGeminiImage(result: any): Buffer {
    const parts = result.candidates?.[0]?.content?.parts || []
    const imagePart = parts.find((part: Record<string, unknown>) => {
        const inline = (part.inline_data || part.inlineData) as { data?: string } | undefined
        return Boolean(inline?.data && !part.thought)
    }) || parts.find((part: Record<string, unknown>) => {
        const inline = (part.inline_data || part.inlineData) as { data?: string } | undefined
        return Boolean(inline?.data)
    })

    const inline = imagePart?.inline_data || imagePart?.inlineData
    if (inline?.data) return Buffer.from(inline.data, 'base64')

    const blockReason = result.promptFeedback?.blockReason
    const finishReason = result.candidates?.[0]?.finishReason
    if (blockReason) throw new Error(`Content blocked: ${blockReason}`)
    if (finishReason) throw new Error(`No image generated: ${finishReason}`)
    throw new Error('No image generated')
}

async function normalizeInputForReference(inputBuffer: Buffer): Promise<Buffer> {
    return sharp(inputBuffer)
        .rotate()
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toBuffer()
}

async function generateGeminiRemaster(inputBuffer: Buffer, model: RemasterModel): Promise<Buffer> {
    if (!GEMINI_API_KEY) throw new Error('Google API Key missing')

    const sourceJpeg = await normalizeInputForReference(inputBuffer)

    const payload = {
        contents: [{
            parts: [
                { text: REFRESH_PROMPT },
                {
                    inline_data: {
                        mime_type: 'image/jpeg',
                        data: sourceJpeg.toString('base64'),
                    },
                },
            ],
        }],
        generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: {
                imageSize: '4K',
            },
        },
        safetySettings: GEMINI_SAFETY_SETTINGS,
    }

    const response = await fetch(`${GEMINI_BASE_URL}/${geminiModelId(model)}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`Google API ${response.status}: ${body.slice(0, 200)}`)
    }

    const result = await response.json()
    return removeMetadata(extractGeminiImage(result))
}

async function generateGpt2Remaster(inputBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    if (!openai) throw new Error('OpenAI API Key not configured')

    const sourceJpeg = await normalizeInputForReference(inputBuffer)
    const imageUrl = `data:image/jpeg;base64,${sourceJpeg.toString('base64')}`
    const size = fitGpt2SizeToInputRatio(width, height)

    const content = [
        { type: 'input_text', text: 'REFERENCE IMAGE TO REFRESH (preserve every detail exactly):' },
        { type: 'input_image', image_url: imageUrl },
        { type: 'input_text', text: REFRESH_PROMPT },
    ]

    let lastError = 'GPT 2 returned no image'
    for (let attempt = 1; attempt <= 2; attempt++) {
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

            const imageOutput = (response.output as any[]).find(output => output?.type === 'image_generation_call')
            if (imageOutput?.result) {
                return removeMetadata(Buffer.from(imageOutput.result, 'base64'))
            }
            lastError = 'GPT 2 response contained no image output'
        } catch (error: unknown) {
            lastError = error instanceof Error ? error.message : String(error)
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 5000))
        }
    }

    throw new Error(lastError)
}

export async function POST(request: NextRequest) {
    try {
        const unauthorized = await requireAdmin(request)
        if (unauthorized) return unauthorized

        const formData = await request.formData()
        const file = formData.get('file')
        const model = normalizeModel(formData.get('model'))

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
        }
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Uploaded file must be an image' }, { status: 400 })
        }

        const inputBuffer = Buffer.from(await file.arrayBuffer())
        const source = await fileToImageDataUrl(file)

        console.log(`[Remaster Tool] model=${model} file="${file.name}" ratio=${source.width}:${source.height}`)

        const result = {
            success: true,
            imageBuffer: model === 'gpt-2'
                ? await generateGpt2Remaster(inputBuffer, source.width, source.height)
                : await generateGeminiRemaster(inputBuffer, model),
            error: null,
        }

        if (!result.success || !result.imageBuffer) {
            return NextResponse.json({ error: result.error || 'Remaster failed' }, { status: 502 })
        }

        return NextResponse.json({
            success: true,
            fileName: file.name,
            width: source.width,
            height: source.height,
            model,
            image: {
                dataUrl: await toPngDataUrl(result.imageBuffer),
            },
        })
    } catch (error: unknown) {
        console.error('[Remaster Tool] error:', error)
        const message = error instanceof Error ? error.message : 'Remaster failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
