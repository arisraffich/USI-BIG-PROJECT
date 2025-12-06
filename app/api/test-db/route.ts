import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createAdminClient()

        // Attempt Connection
        const { data, error } = await supabase.from('projects').select('count', { count: 'exact', head: true })

        // Explicitly extract error properties
        const errorDetails = error ? {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            str: String(error),
            keys: Object.keys(error)
        } : null

        return NextResponse.json({
            status: error ? 'error' : 'success',
            env: {
                url: process.env.NEXT_PUBLIC_SUPABASE_URL,
                hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
                keyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length
            },
            error: errorDetails,
            data: data
        })
    } catch (e: any) {
        return NextResponse.json({
            status: 'critical_error',
            message: e.message,
            stack: e.stack,
            cause: e.cause ? String(e.cause) : null
        })
    }
}
