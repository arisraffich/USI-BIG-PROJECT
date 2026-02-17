import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import sharp from 'sharp'
import { getErrorMessage } from '@/lib/utils/error'

const MAX_SIZE_MB = 20
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
    try {
        // Auth check (same cookie middleware uses)
        const isAuthenticated = request.cookies.get('admin_session_v2')?.value === 'true'
        if (!isAuthenticated) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File
        const projectId = formData.get('projectId') as string
        const pageId = formData.get('pageId') as string
        const pageNumber = formData.get('pageNumber') as string
        const type = formData.get('type') as 'sketch' | 'illustration'

        if (!file || !projectId || !pageId || !type) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
        }

        if (file.size > MAX_SIZE_BYTES) {
            return NextResponse.json({ success: false, error: `File size exceeds ${MAX_SIZE_MB}MB limit.` }, { status: 400 })
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ success: false, error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const timestamp = Date.now()

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        let buffer: Buffer = Buffer.from(arrayBuffer)

        // Resize to max 2048px, save as PNG (lossless — matches AI generation pipeline)
        try {
            buffer = await sharp(buffer)
                .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer()
        } catch (sharpError) {
            console.error('Image Optimization Failed:', sharpError)
            return NextResponse.json({ success: false, error: 'Failed to process image. Please try another file.' }, { status: 500 })
        }

        // Upload to storage
        const storagePath = `${projectId}/illustrations/page-${pageNumber}-${type}-manual-${timestamp}.png`

        const { error: uploadError } = await supabase.storage
            .from('illustrations')
            .upload(storagePath, buffer, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: true
            })

        if (uploadError) {
            return NextResponse.json({ success: false, error: `Storage Upload Failed: ${uploadError.message}` }, { status: 500 })
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('illustrations')
            .getPublicUrl(storagePath)

        // Update database — auto-resolve any pending feedback
        const updateData = type === 'sketch'
            ? { sketch_url: publicUrl, sketch_generated_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_resolved: true }
            : { illustration_url: publicUrl, illustration_generated_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_resolved: true }

        const { error: dbError } = await supabase
            .from('pages')
            .update(updateData)
            .eq('id', pageId)

        if (dbError) {
            return NextResponse.json({ success: false, error: `Database Update Failed: ${dbError.message}` }, { status: 500 })
        }

        return NextResponse.json({ success: true, url: publicUrl })

    } catch (error: unknown) {
        console.error('Upload API Error:', error)
        return NextResponse.json({ success: false, error: getErrorMessage(error, 'Unknown server error') }, { status: 500 })
    }
}
