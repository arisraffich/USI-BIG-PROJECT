import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyCustomerSubmission } from '@/lib/notifications' // Only triggers Slack, safe to use or I will verify internal logic again

// We will NOT import notification functions that send emails.
// The notifyCustomerSubmission function in lib/notifications MAINLY sends Slack.
// Let's re-verify if I should duplicate it to be 100% safe or if I can rely on it.
// Checking previous view of notifications/index.ts:
// notifyCustomerSubmission ONLY calls sendSlackNotification. It does NOT call sendEmail.
// So it is SAFE to use for internal "Submission" logging.

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params
        const body = await request.json()
        const { characterEdits } = body

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // 1. Validate Project Exists
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, book_title, author_firstname, author_lastname, status')
            .eq('id', projectId)
            .single()

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // 2. Update Characters (if edits provided)
        if (characterEdits && Object.keys(characterEdits).length > 0) {
            const characterUpdates = Object.entries(characterEdits).map(([charId, data]: [string, any]) => ({
                id: charId,
                data: data
            }))

            await Promise.all(characterUpdates.map(async (update) => {
                const { error: updateError } = await supabase
                    .from('characters')
                    .update({
                        age: update.data.age,
                        gender: update.data.gender,
                        skin_color: update.data.skin_color,
                        hair_color: update.data.hair_color,
                        hair_style: update.data.hair_style,
                        eye_color: update.data.eye_color,
                        clothing: update.data.clothing,
                        accessories: update.data.accessories,
                        special_features: update.data.special_features,
                        // Allow name updates in manual mode if needed, though usually locked
                        name: update.data.name || undefined
                    })
                    .eq('id', update.id)

                if (updateError) {
                    console.error(`Error updating character ${update.id}:`, updateError)
                }
            }))
        }

        // 3. Logic Flow (Generation vs Approval)
        // Re-fetch to get latest state
        const { data: latestCharacters } = await supabase
            .from('characters')
            .select('*')
            .eq('project_id', project.id)

        if (!latestCharacters) throw new Error('Failed to fetch characters')

        const secondaryCharacters = latestCharacters.filter(c => !c.is_main)
        const pendingGeneration = secondaryCharacters.some(c => !c.image_url || c.image_url.trim() === '')
        const hasFeedback = latestCharacters.some(c => !!c.feedback_notes && !c.is_resolved)


        if (pendingGeneration) {
            // PATH A: GENERATION REQUIRED (Silent)
            await supabase.from('projects').update({ status: 'character_generation' }).eq('id', project.id)

            // Notify Team via Slack (Silent for Customer)
            // notifyCustomerSubmission sends SLACK only.
            await notifyCustomerSubmission({
                projectId: project.id,
                projectTitle: project.book_title,
                authorName: `${project.author_firstname || ''} ${project.author_lastname || ''} (MANUAL ADMIN OVERRIDE)`.trim(),
                projectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/project/${project.id}`,
            })

            // Trigger Background Generation
            const charactersToGenerate = secondaryCharacters.filter(c => !c.image_url || c.image_url.trim() === '')
            if (charactersToGenerate.length > 0) {
                (async () => {
                    try {
                        const { generateCharacterImage } = await import('@/lib/ai/character-generator')
                        const mainChar = latestCharacters.find(c => c.is_main)
                        const mainCharImage = mainChar?.image_url || ''

                        const results = await Promise.all(
                            charactersToGenerate.map(char => generateCharacterImage(char, mainCharImage, project.id))
                        )

                        const allSucceeded = results.every(r => r.success)
                        if (allSucceeded) {
                            const supabaseAdmin = await createAdminClient()
                            await supabaseAdmin.from('projects').update({ status: 'character_generation_complete' }).eq('id', project.id)
                        }
                        // NOTE: completion notification in lib currently sends Slack only?
                        // notifyCharacterGenerationComplete sends SLACK only. Safe.
                    } catch (err) { console.error('Bg generation failed:', err) }
                })()
            }

            return NextResponse.json({
                success: true,
                message: 'Manual submission accepted. Generation started.',
                status: 'character_generation'
            })

        } else {
            // PATH B: APPROVAL (Silent)
            // If we are here, it means all characters have images.
            // If user clicked "Approve" (which sends empty edits usually), we approve.
            // Or if simply saving changes without generation needed.

            // Determine if this is an "Approve" action vs just "Submit Updates"
            // The logic mimics the customer submit:
            // If HAS feedback -> Revision Needed
            // If NO feedback -> Approved

            let newStatus = 'characters_approved'

            if (hasFeedback) {
                newStatus = 'character_revision_needed'
            }

            await supabase.from('projects').update({ status: newStatus }).eq('id', project.id)

            // Slack Only
            await notifyCustomerSubmission({
                projectId: project.id,
                projectTitle: project.book_title,
                authorName: `${project.author_firstname || ''} ${project.author_lastname || ''} (MANUAL ADMIN OVERRIDE)`.trim(),
                projectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/project/${project.id}`,
            })

            return NextResponse.json({
                success: true,
                message: 'Manual update/approval successful.',
                status: newStatus
            })
        }

    } catch (error: any) {
        console.error('Manual Submit Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
