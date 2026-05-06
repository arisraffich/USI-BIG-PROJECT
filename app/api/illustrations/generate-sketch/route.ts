import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { getErrorMessage } from '@/lib/utils/error'
import { SKETCH_PROMPT } from '@/lib/ai/sketch-prompt'
import sharp from 'sharp'

export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const { projectId, pageId, illustrationUrl } = await request.json()

        if (!projectId || !illustrationUrl) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        const { data: page } = await supabase.from('pages').select('id, page_number').eq('id', pageId).single()

        console.log(`Generating sketch for Page ${page?.page_number}...`)

        // 2. Generate Sketch
        const result = await generateSketch(illustrationUrl, SKETCH_PROMPT)

        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Failed to generate sketch')
        }

        // 3. Convert to JPEG and upload to Storage
        const jpegBuffer = await sharp(result.imageBuffer).jpeg({ quality: 95 }).toBuffer()
        const timestamp = Date.now()
        const filename = `${projectId}/sketches/page-${page?.page_number || 'unknown'}-${timestamp}.jpg`

        const { error: uploadError } = await supabase.storage
            .from('sketches')
            .upload(filename, jpegBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            })

        if (uploadError) throw new Error(`Sketch Upload Failed: ${uploadError.message} `)

        const { data: urlData } = supabase.storage.from('sketches').getPublicUrl(filename)
        const publicUrl = urlData.publicUrl

        // 4. Update Page Record
        const { error: updateError } = await supabase.from('pages')
            .update({
                sketch_url: publicUrl,
                sketch_approved_at: null,
                // sketch_generated_at is missing from DB schema
            })
            .eq('id', pageId)

        if (updateError) {
            console.error('Failed to update page with sketch URL:', updateError)
            throw new Error(`Database update failed: ${updateError.message}`)
        }

        console.log(`Sketch saved for Page ${page?.page_number}: ${publicUrl}`)

        return NextResponse.json({
            success: true,
            sketchUrl: publicUrl
        })

    } catch (error: unknown) {
        console.error('Sketch Generation Error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Internal Server Error') },
            { status: 500 }
        )
    }
}
