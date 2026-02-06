import { NextRequest, NextResponse } from 'next/server'
import { getLineArtUrls } from '@/lib/line-art/storage'

export async function GET(request: NextRequest) {
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (!projectId) {
        return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    const files = await getLineArtUrls(projectId)

    return NextResponse.json({
        hasLineArt: files.length > 0,
        count: files.length,
        urls: files,
    })
}
