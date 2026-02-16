import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'

export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const characterId = formData.get('character_id') as string
        const projectId = formData.get('project_id') as string

        if (!file || !characterId || !projectId) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        console.log(`[Character Upload] Starting upload for character: ${characterId}`)

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        
        // Remove metadata
        const cleanedImage = await removeMetadata(buffer)

        const supabase = await createAdminClient()

        // Fetch character details
        const { data: character, error: fetchError } = await supabase
            .from('characters')
            .select('*')
            .eq('id', characterId)
            .single()

        if (fetchError || !character) {
            throw new Error('Character not found')
        }

        // Generate filename
        const baseName = sanitizeFilename(character.name || character.role || `character-${characterId}`)
        let version = 1

        if (character.image_url) {
            const matches = character.image_url.match(/-(\d+)\.png$/)
            if (matches && matches[1]) {
                const currentVersion = parseInt(matches[1], 10)
                if (currentVersion < 1000000) {
                    version = currentVersion + 1
                }
            }
        }

        const filename = `${projectId}/characters/${baseName}-${version}.png`

        // Upload to storage
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

        // Update character record
        const { error: updateError } = await supabase
            .from('characters')
            .update({
                image_url: publicUrl,
                is_resolved: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', characterId)

        if (updateError) {
            throw new Error(`Failed to update character: ${updateError.message}`)
        }

        console.log(`[Character Upload] ✅ Upload complete: ${publicUrl}`)

        // Cleanup old image
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

        // Return upload result immediately — frontend triggers sketch generation separately
        console.log(`[Character Upload] ✅ Upload complete, sketch will be triggered by frontend`)

        // Clear any previous sketch error so UI shows spinner
        await supabase
            .from('characters')
            .update({ sketch_url: null })
            .eq('id', characterId)

        return NextResponse.json({
            success: true,
            imageUrl: publicUrl,
            characterId,
        })

    } catch (error: unknown) {
        console.error('Character upload error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Upload failed') },
            { status: 500 }
        )
    }
}





