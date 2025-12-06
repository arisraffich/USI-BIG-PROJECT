import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const openaiKey = process.env.OPENAI_API_KEY
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

    return NextResponse.json({
        status: 'checking_env',
        openai_key_configured: !!openaiKey,
        openai_key_length: openaiKey?.length || 0,
        openai_key_preview: openaiKey ? `${openaiKey.substring(0, 7)}...` : 'N/A',
        base_url: baseUrl || 'Not set',
        node_env: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    })
}
