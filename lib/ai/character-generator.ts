import { createAdminClient } from '@/lib/supabase/server'
import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'
import { Character } from '@/types/character'
import sharp from 'sharp'
import { geminiEngine, geminiProEngine, gptEngine } from './engines'
import type { AIModel, CharacterEngine, EngineInput, ImageRef } from './engines'

const ENGINES: Record<AIModel, CharacterEngine> = {
  gemini: geminiEngine,
  'gemini-pro': geminiProEngine,
  gpt: gptEngine,
}

const ENGINE_LABELS: Record<AIModel, string> = {
  gemini: 'Gemini',
  'gemini-pro': 'Gemini Pro',
  gpt: 'GPT',
}

async function fetchImageAsBuffer(url: string): Promise<ImageRef | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const raw = Buffer.from(arrayBuffer)

    let finalBuffer: Buffer = raw
    try {
      const resized = await sharp(raw)
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toBuffer()
      finalBuffer = Buffer.from(resized)
    } catch (resizeError) {
      console.warn('Image resize failed, using original:', resizeError)
    }

    return { buffer: finalBuffer, mimeType: 'image/jpeg' }
  } catch (e) {
    console.error('Failed to fetch reference image:', e)
    return null
  }
}

function parseDataUrl(dataUrl: string): ImageRef | null {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!matches) return null
  return { buffer: Buffer.from(matches[2], 'base64'), mimeType: matches[1] }
}

export async function generateCharacterImage(
  character: Character,
  mainCharacterImageUrl: string | null | undefined,
  projectId: string,
  customPrompt?: string,
  visualReferenceImage?: string,
  skipDbUpdate?: boolean,
  useThinking?: boolean,
  aiModel: AIModel = 'gemini'
) {
  const engine = ENGINES[aiModel]
  if (!engine) {
    return { success: false, imageUrl: null, error: `Unknown AI model: ${aiModel}` }
  }

  try {
    const isInitialGeneration = !character.image_url
    const isEditMode = !!(customPrompt && character.image_url && mainCharacterImageUrl)
    const hasVisualRef = !!(visualReferenceImage || (character.reference_photo_url && isInitialGeneration))
    const prompt = customPrompt || buildCharacterPrompt(character, !!mainCharacterImageUrl, hasVisualRef)

    // --- Fetch images in parallel as raw buffers ---
    const [styleReference, visualReference] = await Promise.all([
      mainCharacterImageUrl ? fetchImageAsBuffer(mainCharacterImageUrl) : null,
      visualReferenceImage
        ? Promise.resolve(parseDataUrl(visualReferenceImage))
        : (character.reference_photo_url && isInitialGeneration)
          ? fetchImageAsBuffer(character.reference_photo_url)
          : null,
    ])

    // --- Run the selected engine ---
    const label = ENGINE_LABELS[aiModel] ?? aiModel
    console.log(`[Character Generate] Using ${label} engine for ${character.name || character.role}`)

    const engineInput: EngineInput = {
      prompt,
      isEditMode,
      styleReference,
      visualReference,
      useThinking,
    }

    const result = await engine(engineInput)

    // --- Shared post-processing: upload, DB update, cleanup ---
    const imageBuffer = Buffer.from(result.base64, 'base64')
    const cleanedImage = await removeMetadata(imageBuffer)

    const baseName = sanitizeFilename(character.name || character.role || `character-${character.id}`)
    const timestamp = Date.now()
    const filename = `${projectId}/characters/${baseName}-${timestamp}.png`
    const supabase = await createAdminClient()

    const { error: uploadError } = await supabase.storage
      .from('character-images')
      .upload(filename, cleanedImage, { contentType: 'image/png', upsert: true })

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

      if (character.image_url) {
        try {
          const pathParts = character.image_url.split('/character-images/')
          if (pathParts.length > 1) {
            await supabase.storage
              .from('character-images')
              .remove([pathParts[1]])
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
