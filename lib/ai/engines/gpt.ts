import { openai } from '@/lib/ai/openai'
import type { CharacterEngine, EngineInput, EngineOutput, ImageRef } from './types'
import { STYLE_REFERENCE_PROMPT, APPEARANCE_REFERENCE_PROMPT, EDIT_MODE_PROMPT } from './prompts'

function imageRefToDataUrl(ref: ImageRef): string {
  return `data:${ref.mimeType};base64,${ref.buffer.toString('base64')}`
}

export const gptEngine: CharacterEngine = async (input: EngineInput): Promise<EngineOutput> => {
  if (!openai) {
    throw new Error('OpenAI API Key not configured')
  }

  const content: any[] = []

  if (input.isEditMode) {
    if (input.styleReference) {
      content.push({ type: 'input_image', image_url: imageRefToDataUrl(input.styleReference) })
    }
    content.push({
      type: 'input_text',
      text: `${EDIT_MODE_PROMPT}\n\nModification: ${input.prompt}`,
    })
    if (input.visualReference) {
      content.push({ type: 'input_image', image_url: imageRefToDataUrl(input.visualReference) })
      content.push({ type: 'input_text', text: 'Use this additional reference image to guide the modification.' })
    }
  } else {
    if (input.styleReference) {
      content.push({ type: 'input_image', image_url: imageRefToDataUrl(input.styleReference) })
      content.push({ type: 'input_text', text: STYLE_REFERENCE_PROMPT })
    }
    if (input.visualReference) {
      content.push({ type: 'input_image', image_url: imageRefToDataUrl(input.visualReference) })
      content.push({ type: 'input_text', text: APPEARANCE_REFERENCE_PROMPT })
    }
    content.push({
      type: 'input_text',
      text: `TARGET CHARACTER DESCRIPTION:\n${input.prompt}\n\nGenerate ONLY the character illustration:\n- Full body, standing\n- Plain WHITE background\n- No other objects, no scenery, no text\n- 9:16 portrait orientation`,
    })
  }

  console.log(`[GPT Engine] 🤖 Calling OpenAI Responses API...`)

  const MAX_ATTEMPTS = 2
  let base64Image: string | null = null
  let lastError = 'No image in GPT response'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[GPT Engine] Attempt ${attempt}/${MAX_ATTEMPTS}...`)

    try {
      const response = await openai.responses.create({
        model: 'gpt-4.1',
        input: [{ role: 'user', content }],
        tools: [{
          type: 'image_generation' as any,
          quality: 'high',
          size: '1024x1536',
          input_fidelity: 'high',
        }],
      })

      const imageOutput = (response.output as any[]).find(
        (o: any) => o.type === 'image_generation_call'
      )
      if (imageOutput?.result) {
        base64Image = imageOutput.result
        console.log(`[GPT Engine] ✅ Image received on attempt ${attempt}`)
        break
      }

      lastError = 'GPT response contained no image_generation_call output'
      console.warn(`[GPT Engine] ⚠️ No image on attempt ${attempt}`)
    } catch (apiError: any) {
      lastError = apiError.message || 'OpenAI API error'
      console.error(`[GPT Engine] ❌ API error on attempt ${attempt}:`, lastError)
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  }

  if (!base64Image) throw new Error(lastError)

  return { base64: base64Image }
}
