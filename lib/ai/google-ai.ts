import { removeMetadata } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'
import sharp from 'sharp'

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Reduce false-positive content blocks from datacenter IPs
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
]

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

/**
 * Extracts the generated image from a Gemini API response, handling
 * both camelCase and snake_case field names. Throws descriptive errors
 * for safety blocks and empty responses.
 */
function extractImageFromResponse(result: any, context: string): Buffer {
    const parts = result.candidates?.[0]?.content?.parts || []
    const imagePart = parts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
    const base64 = imagePart?.inline_data?.data || imagePart?.inlineData?.data

    if (base64) return Buffer.from(base64, 'base64')

    const blockReason = result.promptFeedback?.blockReason
    const finishReason = result.candidates?.[0]?.finishReason

    if (blockReason) throw new Error(`[${context}] Content blocked: ${blockReason}`)
    if (finishReason === 'SAFETY' || finishReason === 'IMAGE_SAFETY') {
        throw new Error(`[${context}] Image blocked by safety filters`)
    }
    if (finishReason === 'RECITATION') {
        throw new Error(`[${context}] Content blocked due to recitation policy`)
    }

    console.error(`[${context}] No image in response:`, JSON.stringify({
        promptFeedback: result.promptFeedback,
        finishReason,
        partsCount: parts.length,
    }))
    throw new Error(`[${context}] No image generated — API returned empty response`)
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
    useThinking?: boolean // Enable thinking mode for complex scene composition
    modelId?: string // Override Gemini model (default: gemini-3.1-flash-image-preview)
    isRefresh?: boolean // Quality refresh mode: anchor labeled as source to re-render
}

async function fetchImageAsBase64(
    input: string,
    opts?: { format?: 'jpeg' | 'png', maxSize?: number }
): Promise<{ mimeType: string, data: string } | null> {
    const format = opts?.format ?? 'jpeg'
    const maxSize = opts?.maxSize ?? 2048

    try {
        let buffer: Buffer;

        if (input.startsWith('data:')) {
            const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                console.warn('Invalid Data URI format');
                return null;
            }
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            const response = await fetch(input)
            if (!response.ok) {
                console.warn(`Failed to fetch image URL: ${input} (${response.status})`)
                return null
            }
            const arrayBuffer = await response.arrayBuffer()
            buffer = Buffer.from(arrayBuffer)
        }

        try {
            const meta = await sharp(buffer).metadata()
            const isJpeg = meta.format === 'jpeg'
            const fitsSize = (meta.width ?? 0) <= maxSize && (meta.height ?? 0) <= maxSize

            if (isJpeg && fitsSize && format !== 'png') {
                return { mimeType: 'image/jpeg', data: buffer.toString('base64') }
            }

            const pipeline = sharp(buffer).resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
            if (format === 'png') {
                buffer = await pipeline.png({ compressionLevel: 6 }).toBuffer()
            } else {
                buffer = await pipeline.jpeg({ quality: 95 }).toBuffer()
            }

            return {
                mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                data: buffer.toString('base64')
            }
        } catch (resizeError) {
            console.warn('Image resize failed, using original:', resizeError)
            return {
                mimeType: 'image/jpeg',
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
    hasCustomStyleRefs = false,
    useThinking = false,
    modelId,
    isRefresh = false,
}: GenerateOptions): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {
    const activeModel = modelId || DEFAULT_MODEL
    const isPro = activeModel.includes('-pro-')

    if (!API_KEY) throw new Error('Google API Key missing')

    console.log(`[GoogleAI] processing ${characterReferences.length} chars + anchor: ${!!anchorImage} + sceneRecreation: ${isSceneRecreation} + customStyleRefs: ${hasCustomStyleRefs}`)

    try {
        const parts: any[] = []

        // Fetch all images in parallel for speed
        const charFetches = characterReferences.map(c =>
            fetchImageAsBase64(c.imageUrl, { format: 'png', maxSize: 1536 })
        )
        const anchorFetch = anchorImage
            ? fetchImageAsBase64(anchorImage)
            : Promise.resolve(null)
        const styleFetches = styleReferenceImages.map(url =>
            fetchImageAsBase64(url)
        )
        const allResults = await Promise.allSettled([
            ...charFetches,
            anchorFetch,
            ...styleFetches,
        ])
        const charImages = allResults.slice(0, characterReferences.length)
            .map(r => r.status === 'fulfilled' ? r.value : null)
        const anchorData = allResults[characterReferences.length]
        const anchorResult = anchorData.status === 'fulfilled' ? anchorData.value : null
        const styleImages = allResults.slice(characterReferences.length + 1)
            .map(r => r.status === 'fulfilled' ? r.value : null)

        // 1. Interleaved Character References (Text -> Image)
        for (let i = 0; i < characterReferences.length; i++) {
            const char = characterReferences[i]
            const imgData = charImages[i]
            if (imgData) {
                let label = `Reference image for character named "${char.name}"`
                if (char.role) label += ` (Role: ${char.role})`
                
                if (char.isMain && !hasCustomStyleRefs) {
                    label += ` [MAIN CHARACTER - MASTER STYLE REFERENCE]`
                    label += `\nINSTRUCTION: This image determines the VISUAL STYLE for the ENTIRE ILLUSTRATION.`
                    label += `\n- Apply the Art Style (Medium, Flatness, Texture) of this character to the BACKGROUND, TREES, and PROPS.`
                    label += `\n- The whole scene must look like it belongs in the same universe as this character.`
                } else if (char.isMain && hasCustomStyleRefs) {
                    label += ` [MAIN CHARACTER - IDENTITY REFERENCE]`
                    label += `\nIMPORTANT: This image defines the CHARACTER'S APPEARANCE (face, body, clothing) only.`
                    label += `\nThe artistic STYLE will be determined by the STYLE REFERENCE IMAGES provided separately.`
                }
                label += ":"

                parts.push({ text: label })
                parts.push({
                    inline_data: {
                        mime_type: imgData.mimeType,
                        data: imgData.data
                    }
                })
            }
        }

        // 2. Anchor Image (Style Reference)
        const totalStyleRefs = (anchorImage ? 1 : 0) + styleReferenceImages.length
        const isCustomStyleMode = totalStyleRefs > 0 && !isSceneRecreation
        
        if (anchorResult) {
            let anchorLabel: string
            
            if (isRefresh) {
                anchorLabel = "REFERENCE IMAGE TO REFRESH (preserve every detail exactly):"
            } else if (isSceneRecreation) {
                anchorLabel = "SCENE BASE IMAGE (Edit this scene - preserve environment, change characters):"
            } else if (totalStyleRefs > 1) {
                anchorLabel = `STYLE REFERENCE IMAGE 1 of ${totalStyleRefs}:
This image (along with the other style reference(s)) defines the TARGET ARTISTIC STYLE for the illustration.
Extract and match: Art medium, color palette, line quality, shading technique, texture, and overall aesthetic.`
            } else {
                anchorLabel = "STYLE REFERENCE (Maintain the art style, lighting, and rendering of this reference):"
            }
            
            parts.push({ text: anchorLabel })
            parts.push({
                inline_data: {
                    mime_type: anchorResult.mimeType,
                    data: anchorResult.data
                }
            })
        }

        // 3. Additional Style References
        for (let i = 0; i < styleReferenceImages.length; i++) {
            const imgData = styleImages[i]
            if (imgData) {
                let refLabel: string
                
                if (totalStyleRefs > 1) {
                    refLabel = `STYLE REFERENCE IMAGE ${i + 2} of ${totalStyleRefs}:
This image contributes to the TARGET ARTISTIC STYLE. Match its stylistic qualities along with the other reference(s).`
                } else {
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

        console.log(`[GoogleAI] 📸 Generating illustration at 4K resolution${useThinking ? ' (with thinking)' : ''}`)
        if (isSceneRecreation) {
            console.log('[GoogleAI] 🎬 Scene Recreation Mode active')
        }
        
        const generationConfig: Record<string, any> = {
            responseModalities: ['IMAGE'],
            imageConfig: {
                aspectRatio: aspectRatio,
                imageSize: '4K'
            }
        }
        if (useThinking && !isPro) {
            generationConfig.thinkingConfig = { thinkingLevel: 'HIGH' }
        }

        const payload = {
            contents: [{ parts }],
            generationConfig,
            safetySettings: SAFETY_SETTINGS
        }

        console.log(`[GoogleAI] Using model: ${activeModel}${isPro ? ' (Pro — thinking always on)' : ''}`)

        // Soft-failure retry: retries both HTTP errors and empty responses
        const MAX_ATTEMPTS = 3
        let lastError = 'No image generated'

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                console.log(`[GoogleAI] Illustration attempt ${attempt}/${MAX_ATTEMPTS}...`)

                const response = await fetch(`${BASE_URL}/${activeModel}:generateContent?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })

                if (!response.ok) {
                    const txt = await response.text()
                    const isRetryable = response.status === 503 || response.status === 429
                    lastError = `Google API ${response.status}: ${txt.substring(0, 200)}`

                    if (!isRetryable || attempt === MAX_ATTEMPTS) throw new Error(lastError)
                    const delay = INITIAL_DELAY_MS * attempt
                    console.log(`[GoogleAI] ⚠️ Retrying in ${delay / 1000}s...`)
                    await new Promise(r => setTimeout(r, delay))
                    continue
                }

                const result = await response.json()
                const rawBuffer = extractImageFromResponse(result, 'Illustration')
                const cleanBuffer = await removeMetadata(rawBuffer)
                return { success: true, imageBuffer: cleanBuffer, error: null }
            } catch (err: unknown) {
                lastError = getErrorMessage(err)
                const isSafetyBlock = lastError.includes('safety') || lastError.includes('blocked')
                if (isSafetyBlock || attempt === MAX_ATTEMPTS) throw err
                const delay = INITIAL_DELAY_MS * attempt
                console.log(`[GoogleAI] ⚠️ Attempt ${attempt} empty — retrying in ${delay / 1000}s...`)
                await new Promise(r => setTimeout(r, delay))
            }
        }
        throw new Error(lastError)

    } catch (error: unknown) {
        console.error('generateIllustration error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}

export async function generateSketch(
    sourceImageUrl: string,
    prompt: string
): Promise<{ success: boolean, imageBuffer: Buffer | null, error: string | null }> {
    if (!API_KEY) throw new Error('Google API Key missing')

    try {
        console.log(`[generateSketch] Downloading source image: ${sourceImageUrl.substring(0, 80)}...`)
        const parts: any[] = [{ text: prompt }]

        const img = await fetchImageAsBase64(sourceImageUrl)
        if (img) {
            console.log(`[generateSketch] Image downloaded and resized: ${(img.data.length / 1024).toFixed(0)}KB base64`)
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
            },
            safetySettings: SAFETY_SETTINGS
        }

        // Retry up to 3 times for empty/blocked responses and transient HTTP errors
        const MAX_ATTEMPTS = 3
        let lastError: string = 'No image generated'
        
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`[generateSketch] Attempt ${attempt}/${MAX_ATTEMPTS}...`)
            const callStart = Date.now()
            
            const response = await fetch(`${BASE_URL}/${DEFAULT_MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            
            const callElapsed = ((Date.now() - callStart) / 1000).toFixed(1)

            if (!response.ok) {
                const txt = await response.text()
                const isRetryable = response.status === 503 || response.status === 429
                lastError = `Google API ${response.status} (${callElapsed}s): ${txt.substring(0, 200)}`
                console.error(`[generateSketch] ⚠️ HTTP ${response.status} on attempt ${attempt} (${callElapsed}s)`)
                
                if (!isRetryable || attempt === MAX_ATTEMPTS) throw new Error(lastError)
                const delay = 3000 * attempt
                console.log(`[generateSketch] Retrying in ${delay / 1000}s...`)
                await new Promise(r => setTimeout(r, delay))
                continue
            }

            const result = await response.json()

            try {
                const rawBuffer = extractImageFromResponse(result, 'Sketch')
                console.log(`[generateSketch] ✅ Image received on attempt ${attempt} (${callElapsed}s)`)
                const cleanBuffer = await removeMetadata(rawBuffer)
                return { success: true, imageBuffer: cleanBuffer, error: null }
            } catch (extractErr: unknown) {
                lastError = getErrorMessage(extractErr)
                const isSafetyBlock = lastError.includes('safety') || lastError.includes('blocked')
                if (isSafetyBlock) throw extractErr

                console.error(`[generateSketch] ⚠️ No image on attempt ${attempt} (${callElapsed}s): ${lastError}`)
                if (attempt < MAX_ATTEMPTS) {
                    const delay = 3000 + (attempt * 2000)
                    console.log(`[generateSketch] Retrying in ${delay / 1000}s...`)
                    await new Promise(r => setTimeout(r, delay))
                }
            }
        }
        
        throw new Error(lastError)

    } catch (error: unknown) {
        console.error('[generateSketch] ❌ Final error:', error)
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
            },
            safetySettings: SAFETY_SETTINGS
        }

        // Wrap API call in retry logic
        const result = await retryWithBackoff(async () => {
            const response = await fetch(`${BASE_URL}/${DEFAULT_MODEL}:generateContent?key=${API_KEY}`, {
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

        const rawBuffer = extractImageFromResponse(result, 'Line Art')
        const cleanBuffer = await removeMetadata(rawBuffer)

        return { success: true, imageBuffer: cleanBuffer, error: null }

    } catch (error: unknown) {
        console.error('generateLineArt error:', error)
        return { success: false, imageBuffer: null, error: getErrorMessage(error) }
    }
}
