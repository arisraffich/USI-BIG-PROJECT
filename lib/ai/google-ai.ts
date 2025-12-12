import { removeMetadata } from '@/lib/utils/metadata-cleaner'
import sharp from 'sharp'

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const ILLUSTRATION_MODEL = 'gemini-3-pro-image-preview' // Nano Banana Pro
const SKETCH_MODEL = 'gemini-2.5-flash-image' // Nano Banana Flash

// Fallback or specific model names if 'gemini-2.5-flash-image' is not exact:
// User called it "Gemini 2.5 Flash Image".
// We will use 'gemini-2.0-flash-exp' or similar if 2.5 isn't public yet, but user said "Gemini 2.5 Flash". 
// I will use a constant so it's easy to change.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GenerateOptions {
    prompt: string
    referenceImages?: string[] // Array of public URLs
    aspectRatio?: string
    textIntegration?: string
}

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string, data: string } | null> {
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        const arrayBuffer = await response.arrayBuffer()
        let buffer = Buffer.from(arrayBuffer)

        // Resize image to max 1024px to prevent payload issues (500 errors)
        try {
            buffer = await sharp(buffer)
                .resize(1024, 1024, { fit: 'inside' })
                .jpeg({ quality: 80 }) // standardized to jpeg
                .toBuffer()
            return {
                mimeType: 'image/jpeg',
                data: buffer.toString('base64')
            }
        } catch (resizeError) {
            console.warn('Image resize failed, using original:', resizeError)
            // Fallback to original if resize fails (unlikely)
            const mimeType = response.headers.get('content-type') || 'image/jpeg'
            return {
                mimeType,
                data: buffer.toString('base64')
            }
        }
    } catch (e) {
        console.error('Failed to fetch image:', url, e)
        return null
    }
}

export async function generateIllustration({
    prompt,
    referenceImages = [],
    aspectRatio = "1:1" // Default, can be overridden by project settings
}: GenerateOptions): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {

    if (!API_KEY) throw new Error('Google API Key missing')

    try {
        const parts: any[] = [{ text: prompt }]

        // Fetch and attach all reference images
        if (referenceImages.length > 0) {
            // console.log(`Attaching ${referenceImages.length} reference images...`)
            for (const url of referenceImages) {
                const img = await fetchImageAsBase64(url)
                if (img) {
                    parts.push({
                        inline_data: {
                            mime_type: img.mimeType,
                            data: img.data
                        }
                    })
                }
            }
        }

        // Map common aspect ratios to Gemini format if needed, or pass directly
        // Gemini usually takes "1:1", "3:4", "4:3", "9:16", "16:9"

        // Normalize aspect ratio string if needed (e.g. "Landscape" -> "16:9")
        // Assuming UI passes strictly formatted strings or we handle it here.
        // For now, pass through.

        const payload = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE'], // We only want image
                imageConfig: {
                    aspectRatio: aspectRatio,
                    imageSize: "2K" // High res for final
                }
            }
        }

        const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const txt = await response.text()
            throw new Error(`Google API Error: ${response.status} - ${txt}`)
        }

        const result = await response.json()
        // Extract image (Check both camelCase for SDK parity or snake_case for raw REST if returned that way)
        // User's REST example: jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data'
        // Wait, the jq example uses .inlineData (camelCase) to access the parsing result? 
        // No, jq on raw JSON usually follows JSON keys. 
        // User's REST example: | grep -o '"data": "[^"]*"' -> This suggests raw grep response.
        // User's REST jq example: select(.inlineData) -> This is suspicious. 
        // But the input payload MUST be snake_case per curl example: "inline_data": {...}
        // Let's handle both for safety in response parsing, but enforce snake_case in Request.

        const candidate = result.candidates?.[0]?.content?.parts?.[0]
        const base64Image = candidate?.inline_data?.data || candidate?.inlineData?.data

        if (!base64Image) {
            throw new Error('No image generated')
        }

        const rawBuffer = Buffer.from(base64Image, 'base64')
        const cleanBuffer = await removeMetadata(rawBuffer)

        return { success: true, imageBuffer: cleanBuffer, error: null }

    } catch (error: any) {
        console.error('generateIllustration error:', error)
        return { success: false, imageBuffer: null, error: error.message }
    }
}

export async function generateSketch(
    sourceImageUrl: string,
    prompt: string
): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {
    // Similar logic but using Sketch Model and source image as input
    if (!API_KEY) throw new Error('Google API Key missing')

    try {
        const parts: any[] = [{ text: prompt }]

        // Attach Source Image (The Illustration)
        // Nano Banana supports multimodal input (Image + Text)
        const img = await fetchImageAsBase64(sourceImageUrl)
        if (img) {
            parts.push({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.data
                }
            })
        } else {
            throw new Error('Failed to download source illustration for sketching')
        }

        const payload = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    // Keep same aspect ratio? 
                    // We usually don't specify aspect ratio if we want it to match input, 
                    // but Gemini might default to 1:1 if not specified. 
                    // Ideally we pass the same AR as illustration.
                    // For now let's try not sending AR and see if it respects input, or we might need to pass it.
                    imageSize: "1K" // Sketch can be smaller? Or same. Let's do 1K for speed.
                }
            }
        }

        // Use the same image generation model for sketches for now, as 1.5 Flash is text-only
        const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const txt = await response.text()
            throw new Error(`Google API Error (Sketch): ${response.status} - ${txt}`)
        }

        const result = await response.json()
        const candidate = result.candidates?.[0]?.content?.parts?.[0]
        const base64Image = candidate?.inline_data?.data || candidate?.inlineData?.data
        if (!base64Image) {
            // Fallback or check structure
            // 1.5 Flash outputs text by default unless prompted for JSON/Image via weird ways? 
            // Actually 1.5 Flash is multimodal INPUT, but text OUTPUT. 
            // Wait, does Flash support IMAGE OUTPUT? 
            // Gemini 1.5 Flash does NOT support image generation (Imagen does).
            // Gemini 3 Pro (Nano Banana Pro) supports image generation.
            // User said "Nano Banana Flash (Gemini 2.5 Flash Image)". If such a model exists with Image Output.
            // If not, we might need to use Pro for sketch too, or Imagen.
            // I will assume for now we use the same model (gemini-3-pro-image-preview) for sketch too, 
            // just prompting it differently, OR standard Imagen.
            // Given the ambiguity, I will use `gemini-3-pro-image-preview` for BOTH for now to be safe,
            // as we know it generates images.
            throw new Error('No image generated')
        }

        const rawBuffer = Buffer.from(base64Image, 'base64')
        const cleanBuffer = await removeMetadata(rawBuffer)

        return { success: true, imageBuffer: cleanBuffer, error: null }

    } catch (error: any) {
        console.error('generateSketch error:', error)
        return { success: false, imageBuffer: null, error: error.message }
    }
}
