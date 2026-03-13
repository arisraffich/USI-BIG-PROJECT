import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ characterId: string }> }
) {
    try {
        const { characterId } = await params

        const supabase = await createAdminClient()

        const { data: character, error: charError } = await supabase
            .from('characters')
            .select('id, project_id, feedback_notes, feedback_history, is_resolved')
            .eq('id', characterId)
            .single()

        if (charError || !character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 })
        }

        if (!character.feedback_notes) {
            return NextResponse.json({ error: 'No feedback to resolve' }, { status: 400 })
        }

        if (character.is_resolved) {
            return NextResponse.json({ error: 'Feedback is already resolved' }, { status: 400 })
        }

        const { data: updated, error: updateError } = await supabase
            .from('characters')
            .update({ is_resolved: true })
            .eq('id', characterId)
            .select()
            .single()

        if (updateError) {
            console.error('Error resolving character feedback:', updateError)
            return NextResponse.json({ error: 'Failed to resolve feedback' }, { status: 500 })
        }

        return NextResponse.json(updated)
    } catch (error: unknown) {
        console.error('Error resolving character feedback:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to resolve feedback') },
            { status: 500 }
        )
    }
}
