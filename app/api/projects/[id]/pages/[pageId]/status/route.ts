import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string; pageId: string }> }
) {
    try {
        const { id: projectId, pageId } = await params
        const supabase = await createAdminClient()

        const { data, error } = await supabase
            .from('pages')
            .select('character_actions, illustration_status')
            .eq('id', pageId)
            .single()

        if (error) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 })
        }

        return NextResponse.json({
            hasActions: !!data.character_actions && Object.keys(data.character_actions).length > 0,
            status: data.illustration_status,
            actions: data.character_actions
        })

    } catch (e: unknown) {
        return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 })
    }
}
