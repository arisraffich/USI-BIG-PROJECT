import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
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

    // Get project info for ZIP filename
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, status')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verify project is in the correct status
    if (project.status !== 'illustration_approved') {
      return NextResponse.json(
        { error: 'Download only available when illustrations are approved' },
        { status: 403 }
      )
    }

    // Get all pages with their illustrations
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, page_number, sketch_url, illustration_url')
      .eq('project_id', id)
      .order('page_number', { ascending: true })

    if (pagesError) {
      console.error('Error fetching pages:', pagesError)
      return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: 'No pages found for this project' }, { status: 404 })
    }

    // Create ZIP file
    const zip = new JSZip()
    const sketchesFolder = zip.folder('Sketches')
    const illustrationsFolder = zip.folder('Illustrations')

    // Track download promises
    const downloadPromises: Promise<void>[] = []

    // Process each page
    for (const page of pages) {
      const pageNum = page.page_number

      // Download sketch if exists
      if (page.sketch_url && sketchesFolder) {
        const sketchPromise = fetch(page.sketch_url)
          .then(async (response) => {
            if (response.ok) {
              const blob = await response.blob()
              const arrayBuffer = await blob.arrayBuffer()
              sketchesFolder.file(`sketch ${pageNum}.png`, arrayBuffer)
            }
          })
          .catch((err) => {
            console.error(`Failed to download sketch for page ${pageNum}:`, err)
          })
        downloadPromises.push(sketchPromise)
      }

      // Download illustration if exists
      if (page.illustration_url && illustrationsFolder) {
        const illustrationPromise = fetch(page.illustration_url)
          .then(async (response) => {
            if (response.ok) {
              const blob = await response.blob()
              const arrayBuffer = await blob.arrayBuffer()
              illustrationsFolder.file(`illustration ${pageNum}.png`, arrayBuffer)
            }
          })
          .catch((err) => {
            console.error(`Failed to download illustration for page ${pageNum}:`, err)
          })
        downloadPromises.push(illustrationPromise)
      }
    }

    // Wait for all downloads to complete
    await Promise.all(downloadPromises)

    // Generate ZIP file
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

    // Create filename from book title (replace spaces with underscores, remove special chars)
    const safeTitle = (project.book_title || 'illustrations')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim()
    const filename = `${safeTitle}.zip`

    // Return ZIP file as response
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error generating download:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate download') },
      { status: 500 }
    )
  }
}
