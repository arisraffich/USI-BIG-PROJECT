import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()
    const projectId = '8d58e31d-1089-419b-8a26-9bcb87401015'

    const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .eq('project_id', projectId)
        .eq('page_number', 1)
        .single()

    console.log('Page 1 Status Check:', {
        projectId,
        page,
        error: error?.message
    })

    return NextResponse.json({ page, error })
}
