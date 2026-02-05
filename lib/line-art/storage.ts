/**
 * Line Art Storage
 * 
 * Upload, replace, and retrieve line art PNGs from Supabase Storage.
 * Bucket: 'lineart'
 * Path: {projectId}/lineart {pageNumber}.png
 */

import { createAdminClient } from '@/lib/supabase/server'

const BUCKET = 'lineart'

/**
 * Upload a line art PNG to Supabase Storage.
 * Uses upsert to replace existing files.
 */
export async function uploadLineArt(
    projectId: string,
    pageNumber: number,
    pngBuffer: Buffer
): Promise<{ url: string }> {
    const supabase = await createAdminClient()
    const filePath = `${projectId}/lineart ${pageNumber}.png`

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, pngBuffer, {
            contentType: 'image/png',
            upsert: true,
        })

    if (uploadError) {
        console.error(`[LineArt Storage] Upload failed for page ${pageNumber}:`, uploadError)
        throw new Error(`Failed to upload line art: ${uploadError.message}`)
    }

    const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath)

    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`
    console.log(`[LineArt Storage] Uploaded page ${pageNumber}: ${publicUrl}`)

    return { url: publicUrl }
}

/**
 * Get all line art URLs for a project
 */
export async function getLineArtUrls(
    projectId: string
): Promise<{ pageNumber: number; url: string }[]> {
    const supabase = await createAdminClient()

    const { data: files, error } = await supabase.storage
        .from(BUCKET)
        .list(projectId, { sortBy: { column: 'name', order: 'asc' } })

    if (error) {
        console.error('[LineArt Storage] List error:', error)
        return []
    }

    if (!files || files.length === 0) {
        return []
    }

    return files
        .filter(f => f.name.startsWith('lineart ') && f.name.endsWith('.png'))
        .map(f => {
            // Extract page number from "lineart {N}.png"
            const match = f.name.match(/lineart (\d+)\.png/)
            const pageNumber = match ? parseInt(match[1]) : 0

            const { data: urlData } = supabase.storage
                .from(BUCKET)
                .getPublicUrl(`${projectId}/${f.name}`)

            return { pageNumber, url: urlData.publicUrl }
        })
        .filter(f => f.pageNumber > 0)
        .sort((a, b) => a.pageNumber - b.pageNumber)
}

/**
 * Check if line art exists for a project
 */
export async function hasLineArt(projectId: string): Promise<boolean> {
    const urls = await getLineArtUrls(projectId)
    return urls.length > 0
}
