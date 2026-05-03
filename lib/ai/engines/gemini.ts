import type { CharacterEngine, EngineInput, EngineOutput } from './types'
import { STYLE_REFERENCE_PROMPT, APPEARANCE_REFERENCE_PROMPT, EDIT_MODE_PROMPT } from './prompts'

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
]

type GeminiRequestPart =
  | { text: string }
  | { inlineData: { mimeType: string, data: string } }

interface GeminiGenerationConfig {
  responseModalities: string[]
  imageConfig: {
    aspectRatio: string
    imageSize: string
  }
  thinkingConfig?: {
    thinkingLevel: 'HIGH'
  }
}

interface GeminiResponsePart {
  inlineData?: { data?: string }
  inline_data?: { data?: string }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiResponsePart[]
    }
    finishReason?: string
    finishMessage?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

function createGeminiEngine(modelId: string): CharacterEngine {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`
  const isPro = modelId.includes('-pro-')
  const label = isPro ? 'Gemini Pro' : 'Gemini'

  return async (input: EngineInput): Promise<EngineOutput> => {
    if (!GOOGLE_API_KEY) {
      throw new Error('Google Generative AI API Key not configured')
    }

    const parts: GeminiRequestPart[] = []

    if (input.isEditMode) {
      if (input.styleReference) {
        parts.push({
          text: `${EDIT_MODE_PROMPT}\n\nModification: ${input.prompt}`
        })
        parts.push({
          inlineData: { mimeType: input.styleReference.mimeType, data: input.styleReference.buffer.toString('base64') }
        })
      }
      if (input.visualReference) {
        parts.push({ text: 'Use this additional reference image to guide the modification:' })
        parts.push({
          inlineData: { mimeType: input.visualReference.mimeType, data: input.visualReference.buffer.toString('base64') }
        })
      }
    } else {
      if (input.styleReference) {
        parts.push({ text: STYLE_REFERENCE_PROMPT })
        parts.push({
          inlineData: { mimeType: input.styleReference.mimeType, data: input.styleReference.buffer.toString('base64') }
        })
      }
      if (input.visualReference) {
        parts.push({ text: APPEARANCE_REFERENCE_PROMPT })
        parts.push({
          inlineData: { mimeType: input.visualReference.mimeType, data: input.visualReference.buffer.toString('base64') }
        })
      }
      parts.push({ text: `TARGET CHARACTER DESCRIPTION:\n${input.prompt}` })
    }

    const generationConfig: GeminiGenerationConfig = {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '9:16', imageSize: '4K' }
    }

    // NB2: thinking is controllable (minimal default, HIGH on request)
    // NB Pro: thinking is always-on, don't send thinkingConfig
    if (!isPro && (!input.isEditMode || input.useThinking)) {
      generationConfig.thinkingConfig = { thinkingLevel: 'HIGH' }
    }

    const payload = {
      contents: [{ parts }],
      generationConfig,
      safetySettings: SAFETY_SETTINGS,
    }

    const MAX_ATTEMPTS = 3
    let base64Image: string | null = null
    let lastError = 'No image found in Google API response'

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[${label} Engine] Attempt ${attempt}/${MAX_ATTEMPTS}...`)

      const response = await fetch(`${apiUrl}?key=${GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        const isRetryable = response.status === 503 || response.status === 429
        lastError = `Google API ${response.status}: ${errorText.substring(0, 200)}`
        if (!isRetryable || attempt === MAX_ATTEMPTS) throw new Error(lastError)
        console.log(`[${label} Engine] ⚠️ HTTP ${response.status}, retrying in ${attempt * 3}s...`)
        await new Promise(r => setTimeout(r, attempt * 3000))
        continue
      }

      const result = await response.json() as GeminiResponse

      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            base64Image = part.inlineData.data
            break
          }
        }
      }

      if (base64Image) {
        console.log(`[${label} Engine] ✅ Image received on attempt ${attempt}`)
        break
      }

      const finishReason = result.candidates?.[0]?.finishReason
      const blockReason = result.promptFeedback?.blockReason

      console.error(`[${label} Engine] ⚠️ No image on attempt ${attempt}:`, JSON.stringify({
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
        console.log(`[${label} Engine] Retrying in ${delay / 1000}s...`)
        await new Promise(r => setTimeout(r, delay))
      }
    }

    if (!base64Image) throw new Error(lastError)

    return { base64: base64Image }
  }
}

export const geminiEngine = createGeminiEngine('gemini-3.1-flash-image-preview')
export const geminiProEngine = createGeminiEngine('gemini-3-pro-image-preview')
