import Replicate from 'replicate'
import { createAdminClient } from '@/lib/supabase/server'
import { buildCharacterPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { Character } from '@/types/character'

// Initialize Replicate client
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
})

export async function generateCharacterImage(
    character: Character,
    mainCharacterImageUrl: string,
    projectId: string,
    customPrompt?: string
) {
    try {
        const prompt = customPrompt || buildCharacterPrompt(character)

        console.log(`Generating image for character ${character.id} using google/nano-banana-pro...`)

        // Using 'google/nano-banana-pro' as requested by user. Supports image reference.
        const output = await replicate.run('google/nano-banana-pro', {
            input: {
                prompt: prompt,
                image_input: [mainCharacterImageUrl],
                aspect_ratio: '9:16',
                resolution: '2K',
                output_format: 'png',
                safety_filter_level: 'block_only_high',
            },
        })

        // Handle Replicate output (which might be string or array of strings)
        let imageUrl: string
        if (Array.isArray(output) && output.length > 0) {
            imageUrl = output[0]
        } else if (typeof output === 'string') {
            imageUrl = output
        } else if (output && typeof (output as any).url === 'function') {
            imageUrl = (output as any).url()
        } else if (output && typeof output === 'object' && 'url' in output) {
            imageUrl = (output as any).url as string
        } else {
            console.error('Unexpected output:', output)
            throw new Error('Unexpected output format from Replicate')
        }

        if (!imageUrl) {
            throw new Error('No image URL returned from generation')
        }

        const imageResponse = await fetch(imageUrl)
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.statusText}`)
        }
        const imageBuffer = await imageResponse.arrayBuffer()

        const cleanedImage = await removeMetadata(imageBuffer)

        const filename = `${projectId}/characters/${sanitizeFilename(
            character.name || character.role || `character-${character.id}`
        )}.png`
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
            })
            .eq('id', character.id)

        if (updateError) {
            throw new Error(`Failed to update character: ${updateError.message}`)
        }

        return { success: true, imageUrl: publicUrl, error: null }
    } catch (error: any) {
        console.error(`Error generating image for character ${character.id}:`, error)
        return { success: false, imageUrl: null, error: error.message || 'Generation failed' }
    }
}
