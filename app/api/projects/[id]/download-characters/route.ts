import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { addCharactersToZip } from '@/lib/utils/zip-helpers'
import { getErrorMessage } from '@/lib/utils/error'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: characters, error: charsError } = await supabase
      .from('characters')
      .select('name, is_main, image_url')
      .eq('project_id', id)
      .not('image_url', 'is', null)
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true })

    if (charsError || !characters || characters.length === 0) {
      return NextResponse.json({ error: 'No characters found' }, { status: 404 })
    }

    const zip = new JSZip()
    await addCharactersToZip(zip, characters)

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

    const safeTitle = (project.book_title || 'characters')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim()

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeTitle}_Characters.zip"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error downloading characters:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to download characters') },
      { status: 500 }
    )
  }
}
