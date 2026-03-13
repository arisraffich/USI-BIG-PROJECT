
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams
    const url = searchParams.get('url')
    const filename = searchParams.get('filename')

    if (!url || !filename) {
        return new NextResponse('Missing url or filename', { status: 400 })
    }

    try {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Failed to fetch image')

        const headers = new Headers()
        headers.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream')
        headers.set('Content-Disposition', `attachment; filename="${filename}"`)
        const contentLength = response.headers.get('Content-Length')
        if (contentLength) headers.set('Content-Length', contentLength)

        return new NextResponse(response.body, { status: 200, headers })
    } catch (error) {
        console.error('Download proxy error:', error)
        return new NextResponse('Failed to download image', { status: 500 })
    }
}
