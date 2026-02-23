import { NextResponse } from 'next/server'
import { getMonitorStatus } from '@/lib/health/google-ai-monitor'

export const dynamic = 'force-dynamic'

export async function GET() {
    return NextResponse.json(getMonitorStatus())
}
