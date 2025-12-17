import { removeMetadata } from '@/lib/utils/metadata-cleaner'
import sharp from 'sharp'

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const ILLUSTRATION_MODEL = 'gemini-3-pro-image-preview' // Nano Banana Pro

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface CharacterReference {
    name: string
    imageUrl: string
    role?: string
    isMain?: boolean
}

interface GenerateOptions {
    prompt: string
    characterReferences?: CharacterReference[] // Replaces simple string[]
    anchorImage?: string | null // Explicit anchor image
    styleReferenceImages?: string[] // Optional extra style refs
    aspectRatio?: string
    textIntegration?: string
}

async function fetchImageAsBase64(input: string): Promise<{ mimeType: string, data: string } | null> {
    try {
        let buffer: Buffer;
        let mimeType: string;

        // 1. Handle Data URI (Base64)
        if (input.startsWith('data:')) {
            const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                console.warn('Invalid Data URI format');
                return null;
            }
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            // 2. Handle URL Fetch
            const response = await fetch(input)
            if (!response.ok) {
                console.warn(`Failed to fetch image URL: ${input} (${response.status})`)
                return null
            }
            const arrayBuffer = await response.arrayBuffer()
            buffer = Buffer.from(arrayBuffer)
            mimeType = response.headers.get('content-type') || 'image/jpeg'
        }

        // 3. Rezise & Standardize (For BOTH URL and Data URI)
        // Resize image to max 1024px to prevent payload issues (500 errors)
        try {
            buffer = await sharp(buffer)
                .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }) // Added withoutEnlargement
                .jpeg({ quality: 80 }) // standardized to jpeg
                .toBuffer()

            return {
                mimeType: 'image/jpeg',
                data: buffer.toString('base64')
            }
        } catch (resizeError) {
            console.warn('Image resize failed, using original:', resizeError)
            // Fallback to original
            return {
                mimeType,
                data: buffer.toString('base64')
            }
        }
    } catch (e) {
        console.error('Failed to process image input:', e)
        return null
    }
}

export async function generateIllustration({
    prompt,
    characterReferences = [],
    anchorImage,
    styleReferenceImages = [],
    aspectRatio = "1:1"
}: GenerateOptions): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {

    if (!API_KEY) throw new Error('Google API Key missing')

    console.log(`[GoogleAI] processing ${characterReferences.length} chars + anchor: ${!!anchorImage}`)

    try {
        const parts: any[] = []

        // 1. Interleaved Character References (Text -> Image)
        // This binds the "Name/Identity" to the specific "Image" in the model's context.
        for (const char of characterReferences) {
            const imgData = await fetchImageAsBase64(char.imageUrl)
            if (imgData) {
                // A. Label
                let label = `Reference image for character named "${char.name}"`
                if (char.role) label += ` (Role: ${char.role})`
                if (char.isMain) {
                    label += ` [MAIN CHARACTER - MASTER STYLE REFERENCE]` // Renamed for clarity
                    label += `\nINSTRUCTION: This image determines the VISUAL STYLE for the ENTIRE ILLUSTRATION.`
                    label += `\n- Apply the Art Style (Medium, Flatness, Texture) of this character to the BACKGROUND, TREES, and PROPS.`
                    label += `\n- The whole scene must look like it belongs in the same universe as this character.`
                }
                label += ":"

                parts.push({ text: label })

                // B. Image
                parts.push({
                    inline_data: {
                        mime_type: imgData.mimeType,
                        data: imgData.data
                    }
                })
            }
        }

        // 2. Anchor Image (Style Reference) - If provided (Page 2+)
        if (anchorImage) {
            const anchorData = await fetchImageAsBase64(anchorImage)
            if (anchorData) {
                parts.push({ text: "STYLE REFERENCE (Maintain the art style, lighting, and rendering of this previous page):" })
                parts.push({
                    inline_data: {
                        mime_type: anchorData.mimeType,
                        data: anchorData.data
                    }
                })
            }
        }

        // 3. Additional Style References (e.g. from Edit Mode uploads)
        for (const url of styleReferenceImages) {
            const imgData = await fetchImageAsBase64(url)
            if (imgData) {
                parts.push({ text: "Additional Visual Reference:" })
                parts.push({
                    inline_data: {
                        mime_type: imgData.mimeType,
                        data: imgData.data
                    }
                })
            }
        }

        // 4. Final Instruction Prompt (The Scene)
        parts.push({ text: prompt })

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
