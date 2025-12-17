import { createAdminClient } from '@/lib/supabase/server'
import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { Character } from '@/types/character'

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
// Nano Banana Pro model
const MODEL = 'gemini-3-pro-image-preview'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// Helper to fetch image and convert to base64
async function fetchImageAsBase64(url: string): Promise<{ mimeType: string, data: string } | null> {
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const mimeType = response.headers.get('content-type') || 'image/jpeg'
        return {
            mimeType,
            data: buffer.toString('base64')
        }
    } catch (e) {
        console.error('Failed to fetch reference image:', e)
        return null
    }
}

export async function generateCharacterImage(
    character: Character,
    mainCharacterImageUrl: string | null | undefined,
    projectId: string,
    customPrompt?: string
) {
    if (!GOOGLE_API_KEY) {
        throw new Error('Google Generative AI API Key not configured')
    }

    try {
        const prompt = customPrompt || buildCharacterPrompt(character, !!mainCharacterImageUrl)
        // console.log(`Generating image for character ${character.id} using Google Nano Banana Pro...`)

        const parts: any[] = []

        // 1. ADD STYLE REFERENCE FIRST (Context Priming)
        // We show the style reference BEFORE the character description to prevent semantic bias.
        if (mainCharacterImageUrl) {
            const refImage = await fetchImageAsBase64(mainCharacterImageUrl)
            if (refImage) {
                // LABEL THE REFERENCE EXPLICITLY
                parts.push({
                    text: `[STYLE REFERENCE IMAGE - PRIMARY SOURCE OF TRUTH]
INSTRUCTION: This image defines the ART STYLE and RENDERING TECHNIQUE.
1. DYNAMIC STYLE ADOPTION: You must adopt the EXACT medium and dimensionality of this reference.
2. IF FLAT/VECTOR: If the reference is 2D/Flat, you MUST render the new character as 2D/Flat (ignore "feathers/fur" realism).
3. IF 3D/REALISTIC: If the reference is 3D/Realistic/Painted, you MUST render the new character with that same depth and texture.
4. Override any semantic biases. The Reference Image is the strict guide for "How it looks".`
                })

                parts.push({
                    inlineData: {
                        mimeType: refImage.mimeType,
                        data: refImage.data
                    }
                })
            }
        }

        // 2. ADD CHARACTER DESCRIPTION SECOND
        // The model now views this description through the lens of the style established above.
        parts.push({ text: `TARGET CHARACTER DESCRIPTION:\n${prompt}` })

        const payload = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    // Portrait aspect ratio for characters
                    aspectRatio: "9:16",
                    imageSize: "2K"
                }
            }
        }

        const response = await fetch(`${API_URL}?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Google API Error: ${response.status} - ${errorText}`)
        }

        const result = await response.json()
        let base64Image: string | null = null

        // Parse response to find image data
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0]
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        base64Image = part.inlineData.data
                        break
                    }
                }
            }
        }

        if (!base64Image) {
            console.error('Google API Response:', JSON.stringify(result, null, 2))
            throw new Error('No image found in Google API response')
        }

        // Convert base64 back to buffer for upload
        const imageBuffer = Buffer.from(base64Image, 'base64')
        const cleanedImage = await removeMetadata(imageBuffer)

        const baseName = sanitizeFilename(character.name || character.role || `character-${character.id}`)
        let version = 1

        if (character.image_url) {
            // Try to extract version from existing URL
            // Look for -Number.png at the end
            const matches = character.image_url.match(/-(\d+)\.png$/)
            if (matches && matches[1]) {
                const currentVersion = parseInt(matches[1], 10)
                // If version is a timestamp (large number like 1765...), reset to 1
                // Otherwise increment
                if (currentVersion < 1000000) {
                    version = currentVersion + 1
                }
            }
        }

        const filename = `${projectId}/characters/${baseName}-${version}.png`
        const supabase = await createAdminClient()
        const { error: uploadError } = await supabase.storage
            .from('character-images')
            .upload(filename, cleanedImage, {
                contentType: 'image/png',
                upsert: true,
            })

        if (uploadError) {
            throw new Error(`Failed to upload image: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
            .from('character-images')
            .getPublicUrl(filename)
        const publicUrl = urlData.publicUrl

        const { error: updateError } = await supabase
            .from('characters')
            .update({
                image_url: publicUrl,
                generation_prompt: prompt,
                is_resolved: true,
            })
            .eq('id', character.id)

        if (updateError) {
            throw new Error(`Failed to update character: ${updateError.message}`)
        }

        // Cleanup old image to avoid storage clutter and ensure clean replacement
        if (character.image_url) {
            try {
                // Extract path from public URL
                // Format: .../storage/v1/object/public/character-images/PATH
                const pathParts = character.image_url.split('/character-images/')
                if (pathParts.length > 1) {
                    const oldPath = pathParts[1]
                    await supabase.storage
                        .from('character-images')
                        .remove([oldPath])
                }
            } catch (cleanupError) {
                console.warn('Failed to cleanup old character image:', cleanupError)
            }
        }

        return { success: true, imageUrl: publicUrl, error: null }
    } catch (error: any) {
        console.error(`Error generating image for character ${character.id}:`, error)
        return { success: false, imageUrl: null, error: error.message || 'Generation failed' }
    }
}
