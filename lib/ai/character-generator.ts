import { createAdminClient } from '@/lib/supabase/server'
import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'
import { Character } from '@/types/character'
import sharp from 'sharp'

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const MODEL = 'gemini-3-pro-image-preview'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string, data: string } | null> {
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        const arrayBuffer = await response.arrayBuffer()
        let buffer: Buffer = Buffer.from(arrayBuffer)

        try {
            buffer = await sharp(buffer)
                .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 95 })
                .toBuffer()
        } catch (resizeError) {
            console.warn('Image resize failed, using original:', resizeError)
        }

        return {
            mimeType: 'image/jpeg',
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
    customPrompt?: string,
    visualReferenceImage?: string, // base64 data URL for appearance reference
    skipDbUpdate?: boolean // When true, upload to storage but don't save to DB (comparison mode)
) {
    if (!GOOGLE_API_KEY) {
        throw new Error('Google Generative AI API Key not configured')
    }

    try {
        const isInitialGeneration = !character.image_url
        const hasVisualRef = !!(visualReferenceImage || (character.reference_photo_url && isInitialGeneration))
        const prompt = customPrompt || buildCharacterPrompt(character, !!mainCharacterImageUrl, hasVisualRef)

        const parts: any[] = []
        const isMainCharRegen = character.is_main && customPrompt && mainCharacterImageUrl

        if (isMainCharRegen) {
            // MAIN CHARACTER REGENERATION: Simple modification prompt
            // Send the current image as the source to modify, with a concise instruction
            const refImage = await fetchImageAsBase64(mainCharacterImageUrl)
            if (refImage) {
                parts.push({
                    text: `Here is the current illustration of a character. Modify this character based on the following instruction while keeping the same art style, proportions, pose, background, and all other visual details unchanged.

Modification: ${prompt}`
                })

                parts.push({
                    inlineData: {
                        mimeType: refImage.mimeType,
                        data: refImage.data
                    }
                })
            }

            // Add visual reference if provided
            if (visualReferenceImage) {
                const matches = visualReferenceImage.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    parts.push({
                        text: `Use this additional reference image to guide the modification:`
                    })
                    parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    })
                }
            }
        } else {
            // SECONDARY CHARACTER GENERATION: Full style reference approach
            // Show the style reference BEFORE the character description to prevent semantic bias
            if (mainCharacterImageUrl) {
                const refImage = await fetchImageAsBase64(mainCharacterImageUrl)
                if (refImage) {
                    parts.push({
                        text: `[STYLE REFERENCE IMAGE]

Analyze this image and extract its complete visual style and drawing technique.
Identify and replicate the medium used (e.g., watercolor, digital watercolor, gouache, soft digital painting).

MATCH FROM THIS REFERENCE:
- Stroke style, texture, shading softness, edge quality
- Color blending method and rendering technique
- Color palette and saturation levels
- Line quality and proportions
- Facial style and overall aesthetic

The new character must look like it was created by the same illustrator using the same tools and method.
Do NOT copy the reference character's identity — only its stylistic technique.

If the reference is 2D/Stylized/Flat: Do NOT render fur, feathers, or scales realistically. No 3D shading, no photorealism.
If the reference is 3D/Realistic: Match that realism level.`
                    })

                    parts.push({
                        inlineData: {
                            mimeType: refImage.mimeType,
                            data: refImage.data
                        }
                    })
                }
            }

            // ADD VISUAL REFERENCE IMAGE
            // Admin-uploaded visual reference always applies.
            // Customer's reference photo only applies on initial generation (no existing image).
            let visualRefData: { mimeType: string, data: string } | null = null

            if (visualReferenceImage) {
                const matches = visualReferenceImage.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    visualRefData = { mimeType: matches[1], data: matches[2] }
                }
            } else if (character.reference_photo_url && !character.image_url) {
                visualRefData = await fetchImageAsBase64(character.reference_photo_url)
            }

            if (visualRefData) {
                parts.push({
                    text: `[APPEARANCE REFERENCE IMAGE]
This image shows what the character should look like physically.
Use it to guide the character's physical appearance, proportions, and distinctive features.
Do NOT copy the art style from this image — the style reference above defines the art style.`
                })

                parts.push({
                    inlineData: {
                        mimeType: visualRefData.mimeType,
                        data: visualRefData.data
                    }
                })
            }

            // ADD CHARACTER DESCRIPTION
            parts.push({ text: `TARGET CHARACTER DESCRIPTION:\n${prompt}` })
        }

        const payload = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: "9:16",
                    imageSize: "4K"
                }
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
            ]
        }

        // Retry up to 3 times for intermittent blocks (blockReason: OTHER, IMAGE_SAFETY)
        const MAX_ATTEMPTS = 3
        let base64Image: string | null = null
        let lastError = 'No image found in Google API response'
        
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`[Character Generate] API attempt ${attempt}/${MAX_ATTEMPTS} for ${character.name || character.role}...`)
            
            const response = await fetch(`${API_URL}?key=${GOOGLE_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const errorText = await response.text()
                const isRetryable = response.status === 503 || response.status === 429
                lastError = `Google API ${response.status}: ${errorText.substring(0, 200)}`
                
                if (!isRetryable || attempt === MAX_ATTEMPTS) {
                    throw new Error(lastError)
                }
                console.log(`[Character Generate] ⚠️ HTTP ${response.status}, retrying in ${attempt * 3}s...`)
                await new Promise(r => setTimeout(r, attempt * 3000))
                continue
            }

            const result = await response.json()
            
            // Search for image in response
            if (result.candidates?.[0]?.content?.parts) {
                for (const part of result.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        base64Image = part.inlineData.data
                        break
                    }
                }
            }

            if (base64Image) {
                console.log(`[Character Generate] ✅ Image received on attempt ${attempt}`)
                break
            }
            
            // No image — log and determine if retryable
            const finishReason = result.candidates?.[0]?.finishReason
            const blockReason = result.promptFeedback?.blockReason
            
            console.error(`[Character Generate] ⚠️ No image on attempt ${attempt}:`, JSON.stringify({
                finishReason, blockReason, 
                finishMessage: result.candidates?.[0]?.finishMessage?.substring(0, 100)
            }))
            
            if (blockReason) {
                lastError = `Content blocked: ${blockReason} (attempt ${attempt}/${MAX_ATTEMPTS})`
            } else if (finishReason === 'IMAGE_SAFETY') {
                lastError = `Image blocked by safety filter (attempt ${attempt}/${MAX_ATTEMPTS})`
            } else {
                lastError = `No image generated (finishReason: ${finishReason || 'unknown'}, attempt ${attempt}/${MAX_ATTEMPTS})`
            }
            
            if (attempt < MAX_ATTEMPTS) {
                const delay = blockReason === 'OTHER' ? 6000 + (attempt * 3000) : 3000 + (attempt * 2000)
                console.log(`[Character Generate] Retrying in ${delay / 1000}s...`)
                await new Promise(r => setTimeout(r, delay))
            }
        }

        if (!base64Image) {
            throw new Error(lastError)
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

        if (!skipDbUpdate) {
            const { error: updateError } = await supabase
                .from('characters')
                .update({
                    image_url: publicUrl,
                    generation_prompt: prompt,
                    is_resolved: true,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', character.id)

            if (updateError) {
                throw new Error(`Failed to update character: ${updateError.message}`)
            }

            // Cleanup old image to avoid storage clutter and ensure clean replacement
            if (character.image_url) {
                try {
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
        }

        return { success: true, imageUrl: publicUrl, error: null }
    } catch (error: unknown) {
        console.error(`Error generating image for character ${character.id}:`, error)
        return { success: false, imageUrl: null, error: getErrorMessage(error, 'Generation failed') }
    }
}
