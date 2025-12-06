import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        return NextResponse.json({ status: 'error', message: 'Missing env vars' })
    }

    const endpoint = `${url}/rest/v1/projects?select=count`

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Range': '0-1'
            },
            cache: 'no-store'
        })

        const text = await response.text()

        return NextResponse.json({
            test: 'Raw Fetch',
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            bodyText: text
        })

    } catch (e: any) {
        return NextResponse.json({
            status: 'fetch_error',
            message: e.message,
            cause: e.cause ? String(e.cause) : null
        })
    }
}
