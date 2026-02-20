import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Only allow retry from failed or stuck generation states
    const allowedStatuses = ['character_generation_failed', 'character_generation']
    if (!allowedStatuses.includes(project.status)) {
      return NextResponse.json(
        { error: `Cannot retry from status "${project.status}"` },
        { status: 403 }
      )
    }

    // Fetch characters — only regenerate those missing images
    const { data: allCharacters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', projectId)

    if (charsError || !allCharacters) {
      return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 })
    }

    const secondaryCharacters = allCharacters.filter(c => !c.is_main)
    const charactersToGenerate = secondaryCharacters.filter(c => !c.image_url || c.image_url.trim() === '')

    if (charactersToGenerate.length === 0) {
      // All characters already have images — advance to complete
      await supabase.from('projects').update({ status: 'character_generation_complete' }).eq('id', projectId)
      return NextResponse.json({ success: true, message: 'All characters already have images', status: 'character_generation_complete' })
    }

    // Set status to character_generation
    await supabase.from('projects').update({ status: 'character_generation' }).eq('id', projectId)

    const mainChar = allCharacters.find(c => c.is_main)
    const mainCharImage = mainChar?.image_url || ''

    console.log(`[Retry Generation] Starting retry for ${charactersToGenerate.length} characters (project ${projectId})`)

    // Fire-and-forget generation
    ;(async () => {
      try {
        const { generateCharacterImage } = await import('@/lib/ai/character-generator')

        const results = await Promise.all(
          charactersToGenerate.map((char) =>
            generateCharacterImage(char as any, mainCharImage, projectId)
              .then(result => ({ ...result, charId: char.id, charName: char.name }))
              .catch(err => {
                console.error(`[Retry Generation] Character ${char.name} ERROR:`, err)
                return { success: false, imageUrl: '', charId: char.id, charName: char.name }
              })
          )
        )

        const allSucceeded = results.every(r => r.success)
        const supabaseAdmin = await createAdminClient()

        if (allSucceeded) {
          await supabaseAdmin.from('projects').update({ status: 'character_generation_complete' }).eq('id', projectId)

          // Trigger sketch generation for newly generated characters
          const { generateCharacterSketch } = await import('@/lib/ai/character-sketch-generator')

          // Main character sketch (if missing)
          if (mainChar?.image_url && !mainChar.sketch_image_url) {
            generateCharacterSketch(
              mainChar.id,
              mainChar.image_url,
              projectId,
              mainChar.name || mainChar.role || 'Main Character'
            ).catch(err => console.error('[Retry] Main char sketch failed:', err))
          }

          results.forEach((result) => {
            if (result.success && result.imageUrl) {
              const character = charactersToGenerate.find(c => c.id === result.charId)
              if (character) {
                generateCharacterSketch(
                  character.id,
                  result.imageUrl,
                  projectId,
                  character.name || character.role || 'Character'
                ).catch(err => console.error(`[Retry] Sketch failed for ${character.name}:`, err))
              }
            }
          })

          console.log(`[Retry Generation] All ${results.length} characters succeeded`)
        } else {
          const failedCount = results.filter(r => !r.success).length
          console.error(`[Retry Generation] ${failedCount}/${results.length} characters failed — setting character_generation_failed`)
          await supabaseAdmin.from('projects').update({ status: 'character_generation_failed' }).eq('id', projectId)
        }

        // Notify admin
        try {
          const { notifyCharacterGenerationComplete } = await import('@/lib/notifications')
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
          await notifyCharacterGenerationComplete({
            projectId,
            projectTitle: project.book_title,
            authorName: `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim(),
            projectUrl: `${baseUrl}/admin/project/${projectId}`,
            generatedCount: results.filter(r => r.success).length,
            failedCount: results.filter(r => !r.success).length,
          })
        } catch (e) {
          console.error('[Retry] Notification error:', e)
        }
      } catch (err: unknown) {
        console.error('[Retry Generation] CRITICAL ERROR:', getErrorMessage(err))
        try {
          const supabaseAdmin = await createAdminClient()
          await supabaseAdmin.from('projects').update({ status: 'character_generation_failed' }).eq('id', projectId)
        } catch { /* last resort */ }
      }
    })()

    return NextResponse.json({
      success: true,
      message: `Retrying generation for ${charactersToGenerate.length} characters`,
      status: 'character_generation'
    })
  } catch (error: unknown) {
    console.error('[Retry Generation] Error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to retry generation') },
      { status: 500 }
    )
  }
}
