import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import sharp from 'sharp'

const MAX_STYLE_REFS = 3
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params
        const formData = await request.formData()
        
        // Get all files from the form data
        const files: File[] = []
        for (let i = 0; i < MAX_STYLE_REFS; i++) {
            const file = formData.get(`file${i}`) as File | null
            if (file && file.size > 0) {
                files.push(file)
            }
        }

        if (files.length === 0) {
            return NextResponse.json(
                { error: 'No files provided' },
                { status: 400 }
            )
        }

        if (files.length > MAX_STYLE_REFS) {
            return NextResponse.json(
                { error: `Maximum ${MAX_STYLE_REFS} style reference images allowed` },
                { status: 400 }
            )
        }

        // Validate all files
        for (const file of files) {
            if (file.size > MAX_SIZE_BYTES) {
                return NextResponse.json(
                    { error: `File ${file.name} exceeds 10MB limit` },
                    { status: 400 }
                )
            }
            if (!ALLOWED_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { error: `File ${file.name} has invalid type. Only JPG, PNG, and WebP are allowed.` },
                    { status: 400 }
                )
            }
        }

        const supabase = createAdminClient()
        const uploadedUrls: string[] = []
        const timestamp = Date.now()

        // Upload each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const arrayBuffer = await file.arrayBuffer()
            let buffer: Buffer = Buffer.from(arrayBuffer)

            // Optimize image - resize to 2048px max, convert to high quality JPEG
            try {
                buffer = await sharp(buffer)
                    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 90, mozjpeg: true })
                    .toBuffer()
            } catch (sharpError) {
                console.error('[Style References] Image optimization failed:', sharpError)
                return NextResponse.json(
                    { error: `Failed to process image ${file.name}. Please try another file.` },
                    { status: 400 }
                )
            }

            // Upload to storage
            const storagePath = `${projectId}/style-references/ref-${i + 1}-${timestamp}.jpg`
            
            const { error: uploadError } = await supabase.storage
                .from('illustrations')
                .upload(storagePath, buffer, {
                    contentType: 'image/jpeg',
                    cacheControl: '31536000', // 1 year cache
                    upsert: true
                })

            if (uploadError) {
                console.error('[Style References] Upload failed:', uploadError)
                return NextResponse.json(
                    { error: `Failed to upload ${file.name}: ${uploadError.message}` },
                    { status: 500 }
                )
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('illustrations')
                .getPublicUrl(storagePath)

            uploadedUrls.push(`${publicUrl}?t=${timestamp}`)
        }

        // Update project with style reference URLs
        const { error: dbError } = await supabase
            .from('projects')
            .update({ 
                style_reference_urls: uploadedUrls,
                updated_at: new Date().toISOString()
            })
            .eq('id', projectId)

        if (dbError) {
            console.error('[Style References] Database update failed:', dbError)
            return NextResponse.json(
                { error: `Failed to save style references: ${dbError.message}` },
                { status: 500 }
            )
        }

        console.log(`[Style References] ✅ Saved ${uploadedUrls.length} style references for project ${projectId}`)

        return NextResponse.json({
            success: true,
            urls: uploadedUrls,
            message: `Successfully uploaded ${uploadedUrls.length} style reference(s)`
        })

    } catch (error: any) {
        console.error('[Style References] Error:', error)
        return NextResponse.json(
            { error: error.message || 'Unknown error occurred' },
            { status: 500 }
        )
    }
}

// DELETE endpoint to remove style references
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params
        const supabase = createAdminClient()

        // Get current style references to delete from storage
        const { data: project } = await supabase
            .from('projects')
            .select('style_reference_urls')
            .eq('id', projectId)
            .single()

        // Delete files from storage if they exist
        if (project?.style_reference_urls?.length) {
            const filesToDelete = project.style_reference_urls.map((url: string) => {
                // Extract path from URL: /storage/v1/object/public/illustrations/projectId/style-references/...
                const match = url.match(/illustrations\/(.+?)(\?|$)/)
                return match ? match[1] : null
            }).filter(Boolean)

            if (filesToDelete.length > 0) {
                await supabase.storage
                    .from('illustrations')
                    .remove(filesToDelete)
            }
        }

        // Clear style references from database
        const { error: dbError } = await supabase
            .from('projects')
            .update({ 
                style_reference_urls: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', projectId)

        if (dbError) {
            return NextResponse.json(
                { error: `Failed to clear style references: ${dbError.message}` },
                { status: 500 }
            )
        }

        console.log(`[Style References] 🗑️ Cleared style references for project ${projectId}`)

        return NextResponse.json({
            success: true,
            message: 'Style references cleared'
        })

    } catch (error: any) {
        console.error('[Style References] Delete error:', error)
        return NextResponse.json(
            { error: error.message || 'Unknown error occurred' },
            { status: 500 }
        )
    }
}
