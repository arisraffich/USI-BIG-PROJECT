import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const projectId = searchParams.get('projectId')

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // Fetch pages with feedback_notes explicit selection
        const { data: pages, error } = await supabase
            .from('pages')
            .select('id, page_number, feedback_notes, is_resolved')
            .eq('project_id', projectId)
            .order('page_number', { ascending: true })

        if (error) throw error

        return NextResponse.json({
            success: true,
            pages
        })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
