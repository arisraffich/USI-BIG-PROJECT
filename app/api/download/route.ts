import { NextRequest, NextResponse } from 'next/server'
import { getAllowedDownloadHosts, sanitizeDownloadFilename } from '@/lib/download'

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams
    const url = searchParams.get('url')
    const filename = searchParams.get('filename')

    if (!url || !filename) {
        return new NextResponse('Missing url or filename', { status: 400 })
    }

    let parsedUrl: URL
    try {
        parsedUrl = new URL(url)
    } catch {
        return new NextResponse('Invalid url', { status: 400 })
    }

    const allowedHosts = getAllowedDownloadHosts()
    if (parsedUrl.protocol !== 'https:' || !allowedHosts.has(parsedUrl.hostname)) {
        return new NextResponse('Download host is not allowed', { status: 403 })
    }

    try {
        const response = await fetch(parsedUrl.toString())
        if (!response.ok) throw new Error('Failed to fetch image')

        const headers = new Headers()
        headers.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream')
        headers.set('Content-Disposition', `attachment; filename="${sanitizeDownloadFilename(filename)}"`)
        const contentLength = response.headers.get('Content-Length')
        if (contentLength) headers.set('Content-Length', contentLength)

        return new NextResponse(response.body, { status: 200, headers })
    } catch (error) {
        console.error('Download proxy error:', error)
        return new NextResponse('Failed to download image', { status: 500 })
    }
}
