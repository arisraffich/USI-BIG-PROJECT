import { NextResponse } from 'next/server'
import { generateLineArt } from '@/lib/ai/google-ai'
import { processLineArtToTransparentPng, LINE_ART_PROMPT } from '@/lib/line-art/processor'
import { uploadLineArt } from '@/lib/line-art/storage'
import { getErrorMessage } from '@/lib/utils/error'

// Allow max duration for AI generation + processing
export const maxDuration = 120

export async function POST(request: Request) {
    try {
        const { illustrationUrl, pageNumber, projectId } = await request.json()

        if (!illustrationUrl) {
            return NextResponse.json({ error: 'Missing illustrationUrl' }, { status: 400 })
        }

        console.log(`[LineArt] Generating line art for page ${pageNumber || 'unknown'}...`)

        // Step 1: Generate line art using AI
        const aiResult = await generateLineArt(illustrationUrl, LINE_ART_PROMPT)

        if (!aiResult.success || !aiResult.imageBuffer) {
            throw new Error(aiResult.error || 'Failed to generate line art')
        }

        console.log(`[LineArt] AI generation complete, processing with Potrace...`)

        // Step 2: Process with Potrace to get transparent PNG @2x
        const pngBuffer = await processLineArtToTransparentPng(aiResult.imageBuffer)

        console.log(`[LineArt] Processing complete, PNG size: ${(pngBuffer.length / 1024).toFixed(1)} KB`)

        // Step 3: Upload to Supabase Storage if projectId provided (bulk mode)
        if (projectId && pageNumber) {
            await uploadLineArt(projectId, pageNumber, pngBuffer)
            console.log(`[LineArt] Uploaded to storage: ${projectId}/lineart ${pageNumber}.png`)
        }

        // Return the PNG directly for download
        const filename = `lineart ${pageNumber || 'unknown'}.png`
        
        return new NextResponse(new Uint8Array(pngBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': pngBuffer.length.toString(),
            },
        })

    } catch (error: unknown) {
        console.error('[LineArt] Generation Error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to generate line art') },
            { status: 500 }
        )
    }
}
