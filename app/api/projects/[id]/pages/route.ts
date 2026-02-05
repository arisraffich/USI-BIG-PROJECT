import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    if (!id) {
        return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    try {
        const supabase = await createAdminClient()

        // Fetch all pages for the project using Service Role (Bypassing RLS)
        const { data: pages, error } = await supabase
            .from('pages')
            .select('*')
            .eq('project_id', id)
            .order('page_number', { ascending: true })

        if (error) {
            console.error('Error fetching pages:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            pages: pages || []
        })

    } catch (error: unknown) {
        console.error('API Error fetching pages:', error)
        return NextResponse.json({ error: getErrorMessage(error, 'Internal Server Error') }, { status: 500 })
    }
}
