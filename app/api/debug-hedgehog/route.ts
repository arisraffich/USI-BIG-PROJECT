
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    const projectId = '939fec2b-0718-4370-a8a3-5c8dc4c09fa8'
    const supabase = await createAdminClient()

    // 1. Get Characters
    const { data: characters } = await supabase
        .from('characters')
        .select('id, name, role, image_url, is_main')
        .eq('project_id', projectId)

    // 2. Get Page 1
    const { data: page1 } = await supabase
        .from('pages')
        .select('illustration_url')
        .eq('project_id', projectId)
        .eq('page_number', 1)
        .single()

    return NextResponse.json({
        characters,
        page1
    })
}
