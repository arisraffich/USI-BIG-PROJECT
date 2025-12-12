'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'

interface UploadResult {
    success: boolean
    url?: string
    error?: string
}

export async function uploadImageAction(formData: FormData): Promise<UploadResult> {
    try {
        const file = formData.get('file') as File
        const projectId = formData.get('projectId') as string
        const pageId = formData.get('pageId') as string
        const pageNumber = formData.get('pageNumber') as string
        const type = formData.get('type') as 'sketch' | 'illustration'

        if (!file || !projectId || !pageId || !type) {
            return { success: false, error: 'Missing required fields' }
        }

        // --- VALIDATION START ---
        const MAX_SIZE_MB = 10
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
        const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

        if (file.size > MAX_SIZE_BYTES) {
            return { success: false, error: `File size exceeds ${MAX_SIZE_MB}MB limit.` }
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return { success: false, error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.' }
        }
        // --- VALIDATION END ---

        const supabase = createAdminClient()
        const timestamp = Date.now()

        // Determine Storage Path
        // Always force standard manual naming convention
        const storagePath = `${projectId}/illustrations/page-${pageNumber}-${type}-manual.jpg` // Always save as jpg

        // Convert file to ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()
        let buffer = Buffer.from(arrayBuffer)

        // --- OPTIMIZATION START ---
        try {
            // Resize to max 2048px (high quality enough for AI ref, small enough for storage/payload)
            buffer = await sharp(buffer as any)
                .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer()
        } catch (sharpError) {
            console.error('Image Optimization Failed:', sharpError)
            return { success: false, error: 'Failed to process image. Please try another file.' }
        }
        // --- OPTIMIZATION END ---

        // 1. Upload to Storage (Overwrite/Upsert) using Admin Client
        const { error: uploadError } = await supabase.storage
            .from('illustrations')
            .upload(storagePath, buffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
            })

        if (uploadError) {
            return { success: false, error: `Storage Upload Failed: ${uploadError.message}` }
        }

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('illustrations')
            .getPublicUrl(storagePath)

        // 3. Update Database with versioned URL
        const versionedUrl = `${publicUrl}?t=${timestamp}`

        const updateData = type === 'sketch'
            ? { sketch_url: versionedUrl, sketch_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            : { illustration_url: versionedUrl, illustration_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() }

        const { error: dbError } = await supabase
            .from('pages')
            .update(updateData)
            .eq('id', pageId)

        if (dbError) {
            return { success: false, error: `Database Update Failed: ${dbError.message}` }
        }

        revalidatePath(`/admin/project/${projectId}`)

        return { success: true, url: versionedUrl }

    } catch (error: any) {
        console.error('Server Upload Action Error:', error)
        return { success: false, error: error.message || 'Unknown server error' }
    }
}
