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
    mainCharacterImageUrl: string | null | undefined,
    projectId: string,
    customPrompt?: string
) {
    try {
        const prompt = customPrompt || buildCharacterPrompt(character)

        console.log(`Generating image for character ${character.id} using google/nano-banana-pro...`)

        // Construct input parameters
        // Only include image_input if a reference image is explicitly provided
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const input: any = {
            prompt: prompt,
            aspect_ratio: '9:16',
            resolution: '2K',
            output_format: 'png',
            safety_filter_level: 'block_only_high',
        }

        if (mainCharacterImageUrl) {
            input.image_input = [mainCharacterImageUrl]
        }

        // Using 'google/nano-banana-pro' as requested by user. Supports image reference.
        const output = await replicate.run('google/nano-banana-pro', { input })

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
