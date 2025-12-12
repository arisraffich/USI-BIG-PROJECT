import { NextResponse } from 'next/server'

export async function GET() {
    // Only return presence, not value for security
    const hasDbUrl = !!process.env.DATABASE_URL
    return NextResponse.json({
        hasDbUrl,
        nodeEnv: process.env.NODE_ENV
    })
}
