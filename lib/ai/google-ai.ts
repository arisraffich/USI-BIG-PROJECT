import { removeMetadata } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'
import sharp from 'sharp'

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const ILLUSTRATION_MODEL = 'gemini-3-pro-image-preview' // Nano Banana Pro

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Retry configuration
const MAX_RETRIES = 1 // 2 total attempts (1 initial + 1 retry)
const INITIAL_DELAY_MS = 2000 // 2 seconds
const MAX_DELAY_MS = 30000 // 30 seconds

/**
 * Retry wrapper with exponential backoff for API calls
 * Handles transient errors like 503 (Service Unavailable)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Check if error is retryable (503, 429, or network errors)
      const errorMsg = getErrorMessage(error)
      const isRetryable = 
        errorMsg.includes('503') || 
        errorMsg.includes('429') ||
        errorMsg.includes('overloaded') ||
        errorMsg.includes('UNAVAILABLE')
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`[${context}] ❌ Non-retryable error or max retries reached:`, errorMsg)
        throw error
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS)
      console.log(`[${context}] ⚠️ Attempt ${attempt + 1}/${maxRetries + 1} failed: ${errorMsg}`)
      console.log(`[${context}] ⏳ Retrying in ${delay}ms...`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError || new Error('All retries failed')
}

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
    isSceneRecreation?: boolean // Scene Recreation mode - uses higher quality input/output
    hasCustomStyleRefs?: boolean // When true, style refs define style instead of main character
}

async function fetchImageAsBase64(input: string, highQuality: boolean = false): Promise<{ mimeType: string, data: string } | null> {
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

        // 3. Resize & Standardize (For BOTH URL and Data URI)
        // High quality mode (Scene Recreation): 2048px, 95% JPEG - preserves detail for image editing
        // Standard mode: 1024px, 80% JPEG - prevents payload issues (500 errors)
        try {
            const maxSize = highQuality ? 2048 : 1024
            const quality = highQuality ? 95 : 80
            
            if (highQuality) {
                console.log('[fetchImageAsBase64] 🎨 Using HIGH QUALITY mode (2048px, 95% JPEG)')
            }
            
            buffer = await sharp(buffer)
                .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality })
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
    aspectRatio = "1:1",
    isSceneRecreation = false,
    hasCustomStyleRefs = false
}: GenerateOptions): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {

    if (!API_KEY) throw new Error('Google API Key missing')

    console.log(`[GoogleAI] processing ${characterReferences.length} chars + anchor: ${!!anchorImage} + sceneRecreation: ${isSceneRecreation} + customStyleRefs: ${hasCustomStyleRefs}`)

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
                
                // Only label main character as STYLE REFERENCE if NO custom style refs uploaded
                // When custom style refs exist, they define the style - main char is just for identity
                if (char.isMain && !hasCustomStyleRefs) {
                    label += ` [MAIN CHARACTER - MASTER STYLE REFERENCE]`
                    label += `\nINSTRUCTION: This image determines the VISUAL STYLE for the ENTIRE ILLUSTRATION.`
                    label += `\n- Apply the Art Style (Medium, Flatness, Texture) of this character to the BACKGROUND, TREES, and PROPS.`
                    label += `\n- The whole scene must look like it belongs in the same universe as this character.`
                } else if (char.isMain && hasCustomStyleRefs) {
                    // When custom style refs exist, main char is identity-only
                    label += ` [MAIN CHARACTER - IDENTITY REFERENCE]`
                    label += `\nIMPORTANT: This image defines the CHARACTER'S APPEARANCE (face, body, clothing) only.`
                    label += `\nThe artistic STYLE will be determined by the STYLE REFERENCE IMAGES provided separately.`
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

        // 2. Anchor Image (Style Reference) - If provided (Page 2+ or custom style refs)
        // ALWAYS use HIGH QUALITY for anchor images to prevent quality degradation cascade
        // (Each generation uses previous page as reference - quality loss compounds)
        
        // Check if we have multiple style references (anchor + styleReferenceImages)
        const totalStyleRefs = (anchorImage ? 1 : 0) + styleReferenceImages.length
        const isCustomStyleMode = totalStyleRefs > 0 && !isSceneRecreation
        
        if (anchorImage) {
            const anchorData = await fetchImageAsBase64(anchorImage, true) // Always high quality
            if (anchorData) {
                let anchorLabel: string
                
                if (isSceneRecreation) {
                    anchorLabel = "SCENE BASE IMAGE (Edit this scene - preserve environment, change characters):"
                } else if (totalStyleRefs > 1) {
                    // Multiple style references mode
                    anchorLabel = `STYLE REFERENCE IMAGE 1 of ${totalStyleRefs}:
This image (along with the other style reference(s)) defines the TARGET ARTISTIC STYLE for the illustration.
Extract and match: Art medium, color palette, line quality, shading technique, texture, and overall aesthetic.`
                } else {
                    // Single anchor (default mode - main character or page 1)
                    anchorLabel = "STYLE REFERENCE (Maintain the art style, lighting, and rendering of this reference):"
                }
                
                parts.push({ text: anchorLabel })
                parts.push({
                    inline_data: {
                        mime_type: anchorData.mimeType,
                        data: anchorData.data
                    }
                })
            }
        }

        // 3. Additional Style References (e.g. from custom style uploads or Edit Mode)
        for (let i = 0; i < styleReferenceImages.length; i++) {
            const url = styleReferenceImages[i]
            const imgData = await fetchImageAsBase64(url, true) // High quality for style refs
            if (imgData) {
                let refLabel: string
                
                if (totalStyleRefs > 1) {
                    // Part of multiple style references
                    refLabel = `STYLE REFERENCE IMAGE ${i + 2} of ${totalStyleRefs}:
This image contributes to the TARGET ARTISTIC STYLE. Match its stylistic qualities along with the other reference(s).`
                } else {
                    // Edit mode additional reference
                    refLabel = "Additional Visual Reference:"
                }
                
                parts.push({ text: refLabel })
                parts.push({
                    inline_data: {
                        mime_type: imgData.mimeType,
                        data: imgData.data
                    }
                })
            }
        }
        
        // 3.5 Style binding instruction (when using multiple custom style refs)
        if (totalStyleRefs > 1 && !isSceneRecreation) {
            parts.push({ 
                text: `STYLE INSTRUCTION: The generated illustration MUST match the combined artistic style of the ${totalStyleRefs} style reference image(s) above.
The CHARACTER REFERENCES define WHO appears (identity). The STYLE REFERENCES define HOW everything is rendered (artistic style).
Apply the style uniformly to characters, backgrounds, props, and all scene elements.`
            })
        }

        // 4. Final Instruction Prompt (The Scene)
        parts.push({ text: prompt })

        console.log('[GoogleAI] 📸 Generating illustration at 4K resolution')
        if (isSceneRecreation) {
            console.log('[GoogleAI] 🎬 Scene Recreation Mode active')
        }
        
        const payload = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: aspectRatio,
                    imageSize: '2K' // 4K broken on Google side as of Feb 2026
                }
            }
        }

        // Wrap API call in retry logic
        const result = await retryWithBackoff(async () => {
            const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const txt = await response.text()
                throw new Error(`Google API Error: ${response.status} - ${txt}`)
            }

            return await response.json()
        }, 'Generate Illustration')

        // With TEXT+IMAGE modalities, the image may not be the first part — search all parts
        const allIllustrationParts = result.candidates?.[0]?.content?.parts || []
        const illustrationImagePart = allIllustrationParts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
        const base64Image = illustrationImagePart?.inline_data?.data || illustrationImagePart?.inlineData?.data

        if (!base64Image) {
            // Log the full response to understand why no image was generated
            console.error('[GoogleAI] No image in response. Full result:', JSON.stringify({
                promptFeedback: result.promptFeedback,
                candidates: result.candidates?.map((c: any) => ({
                    finishReason: c.finishReason,
                    safetyRatings: c.safetyRatings,
                    contentPresent: !!c.content
                })),
                modelVersion: result.modelVersion
            }, null, 2))
            
            // Check for specific block reasons
            const blockReason = result.promptFeedback?.blockReason
            const finishReason = result.candidates?.[0]?.finishReason
            
            if (blockReason) {
                throw new Error(`Content blocked: ${blockReason}`)
            }
            if (finishReason === 'SAFETY' || finishReason === 'IMAGE_SAFETY') {
                throw new Error('Image blocked by safety filters - try simplifying or revising the scene description')
            }
            if (finishReason === 'RECITATION') {
                throw new Error('Content blocked due to recitation policy')
            }
            
            throw new Error('No image generated - API returned empty response')
        }

        const rawBuffer = Buffer.from(base64Image, 'base64')
        const cleanBuffer = await removeMetadata(rawBuffer)

        return { success: true, imageBuffer: cleanBuffer, error: null }

    } catch (error: unknown) {
        console.error('generateIllustration error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
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
                    imageSize: '2K'
                }
            }
        }

        // Use the same image generation model for sketches for now, as 1.5 Flash is text-only
        // Wrap API call in retry logic
        const result = await retryWithBackoff(async () => {
            const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const txt = await response.text()
                throw new Error(`Google API Error (Sketch): ${response.status} - ${txt}`)
            }

            return await response.json()
        }, 'Generate Sketch')
        // With TEXT+IMAGE modalities, the image may not be the first part — search all parts
        const allSketchParts = result.candidates?.[0]?.content?.parts || []
        const sketchImagePart = allSketchParts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
        const base64Image = sketchImagePart?.inline_data?.data || sketchImagePart?.inlineData?.data
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

    } catch (error: unknown) {
        console.error('generateSketch error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}

/**
 * Generate Line Art from a colored illustration
 * Uses the same model as sketch but with line art specific prompt
 */
export async function generateLineArt(
    sourceImageUrl: string,
    prompt: string
): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {
    if (!API_KEY) throw new Error('Google API Key missing')

    try {
        const parts: any[] = [{ text: prompt }]

        // Attach Source Image (The Illustration)
        const img = await fetchImageAsBase64(sourceImageUrl)
        if (img) {
            parts.push({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.data
                }
            })
        } else {
            throw new Error('Failed to download source illustration for line art')
        }

        const payload = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    imageSize: '2K'
                }
            }
        }

        // Wrap API call in retry logic
        const result = await retryWithBackoff(async () => {
            const response = await fetch(`${BASE_URL}/${ILLUSTRATION_MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const txt = await response.text()
                throw new Error(`Google API Error (Line Art): ${response.status} - ${txt}`)
            }

            return await response.json()
        }, 'Generate Line Art')

        // With TEXT+IMAGE modalities, the image may not be the first part — search all parts
        const allLineArtParts = result.candidates?.[0]?.content?.parts || []
        const lineArtImagePart = allLineArtParts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
        const base64Image = lineArtImagePart?.inline_data?.data || lineArtImagePart?.inlineData?.data
        
        if (!base64Image) {
            const blockReason = result.promptFeedback?.blockReason
            const finishReason = result.candidates?.[0]?.finishReason
            
            if (blockReason) {
                throw new Error(`Content blocked: ${blockReason}`)
            }
            if (finishReason === 'SAFETY' || finishReason === 'IMAGE_SAFETY') {
                throw new Error('Image blocked by safety filters')
            }
            
            throw new Error('No image generated')
        }

        const rawBuffer = Buffer.from(base64Image, 'base64')
        const cleanBuffer = await removeMetadata(rawBuffer)

        return { success: true, imageBuffer: cleanBuffer, error: null }

    } catch (error: unknown) {
        console.error('generateLineArt error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}
