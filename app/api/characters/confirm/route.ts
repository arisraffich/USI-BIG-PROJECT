import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export async function POST(request: Request) {
    try {
        const {
            decision,
            characterId,
            projectId,
            oldUrl,
            newUrl,
        } = await request.json() as {
            decision: 'keep_new' | 'revert_old'
            characterId: string
            projectId: string
            oldUrl: string
            newUrl: string
        }

        if (!decision || !characterId || !projectId || !newUrl) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        const extractPath = (url: string): string | null => {
            const parts = url.split('/character-images/')
            return parts.length > 1 ? parts[1] : null
        }

        if (decision === 'keep_new') {
            await supabase.from('characters')
                .update({
                    image_url: newUrl,
                    sketch_url: null,
                    is_resolved: true,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', characterId)

            if (oldUrl) {
                const oldPath = extractPath(oldUrl)
                if (oldPath) {
                    await supabase.storage
                        .from('character-images')
                        .remove([oldPath])
                        .catch(err => console.warn('Failed to delete old character image:', err))
                }
            }

            // Update project status for regeneration flow
            const { data: project } = await supabase
                .from('projects')
                .select('status, character_send_count')
                .eq('id', projectId)
                .single()

            if (project && project.status !== 'character_generation' && project.character_send_count > 0) {
                await supabase.from('projects')
                    .update({ status: 'characters_regenerated' })
                    .eq('id', projectId)
            }

            return NextResponse.json({
                success: true,
                decision: 'keep_new',
                imageUrl: newUrl,
            })

        } else if (decision === 'revert_old') {
            const newPath = extractPath(newUrl)
            if (newPath) {
                await supabase.storage
                    .from('character-images')
                    .remove([newPath])
                    .catch(err => console.warn('Failed to delete new character image:', err))
            }

            return NextResponse.json({
                success: true,
                decision: 'revert_old',
            })
        }

        return NextResponse.json(
            { error: 'Invalid decision' },
            { status: 400 }
        )

    } catch (error: unknown) {
        console.error('Character confirm error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to confirm character') },
            { status: 500 }
        )
    }
}
