import { NextResponse } from 'next/server'
import { triggerMonitoring, getMonitorStatus } from '@/lib/health/google-ai-monitor'

export const dynamic = 'force-dynamic'

export async function POST() {
    triggerMonitoring()
    return NextResponse.json(getMonitorStatus())
}
