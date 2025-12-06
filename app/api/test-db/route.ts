import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createAdminClient()

        // Check Env Vars (safely)
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

        // Attempt Connection
        const { data, error } = await supabase.from('projects').select('count', { count: 'exact', head: true })

        return NextResponse.json({
            status: error ? 'error' : 'success',
            env: {
                url: url,
                hasKey: hasKey,
                keyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length
            },
            error: error,
            data: data
        })
    } catch (e: any) {
        return NextResponse.json({
            status: 'critical_error',
            message: e.message,
            stack: e.stack
        })
    }
}
