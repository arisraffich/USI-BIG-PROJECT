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

        console.log(`[Sketch Upload] Starting sketch upload for character: ${characterId}`)

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
        const timestamp = Date.now()
        const filename = `${baseName}-sketch-${timestamp}.png`
        const storagePath = `${projectId}/${filename}`

        // Upload to character-sketches bucket
        const { error: uploadError } = await supabase.storage
            .from('character-sketches')
            .upload(storagePath, cleanedImage, {
                contentType: 'image/png',
                upsert: true,
            })

        if (uploadError) {
            throw new Error(`Failed to upload sketch: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
            .from('character-sketches')
            .getPublicUrl(storagePath)
        const publicUrl = urlData.publicUrl

        // Update character record with new sketch_url
        const { error: updateError } = await supabase
            .from('characters')
            .update({
                sketch_url: publicUrl,
                is_resolved: true,
            })
            .eq('id', characterId)

        if (updateError) {
            throw new Error(`Failed to update character: ${updateError.message}`)
        }

        console.log(`[Sketch Upload] ✅ Upload complete: ${publicUrl}`)

        // Cleanup old sketch
        if (character.sketch_url) {
            try {
                const pathParts = character.sketch_url.split('/character-sketches/')
                if (pathParts.length > 1) {
                    const oldPath = pathParts[1]
                    await supabase.storage
                        .from('character-sketches')
                        .remove([oldPath])
                }
            } catch (cleanupError) {
                console.warn('Failed to cleanup old sketch:', cleanupError)
            }
        }

        return NextResponse.json({
            success: true,
            sketchUrl: publicUrl,
        })

    } catch (error: unknown) {
        console.error('Sketch upload error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Upload failed') },
            { status: 500 }
        )
    }
}





