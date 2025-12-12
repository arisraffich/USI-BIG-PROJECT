import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { illustrationUrl } = body

        if (!illustrationUrl) {
            return NextResponse.json({ error: 'Missing illustrationUrl' }, { status: 400 })
        }

        console.log('Testing sketch generation with URL:', illustrationUrl)

        // Force a simple prompt
        const prompt = "Convert to pencil sketch"

        // Call the failing function
        const result = await generateSketch(illustrationUrl, prompt)

        return NextResponse.json({
            status: 'Function completed',
            success: result.success,
            error: result.error,
            bufferSize: result.imageBuffer ? result.imageBuffer.length : 0
        })

    } catch (error: any) {
        console.error('Debug Route Error:', error)
        return NextResponse.json({
            error: 'Crash caught',
            message: error.message,
            stack: error.stack,
            details: error.toString()
        }, { status: 500 })
    }
}
