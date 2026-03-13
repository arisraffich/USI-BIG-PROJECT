import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { jsPDF } from 'jspdf'
import { getErrorMessage } from '@/lib/utils/error'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const includeScenes = request.nextUrl.searchParams.get('scenes') !== 'false'

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('page_number, story_text, scene_description, character_actions')
      .eq('project_id', id)
      .order('page_number', { ascending: true })

    if (pagesError || !pages || pages.length === 0) {
      return NextResponse.json({ error: 'No pages found' }, { status: 404 })
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2

    const authorName = [project.author_firstname, project.author_lastname]
      .filter(Boolean).join(' ') || 'Unknown Author'

    // --- Cover page ---
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    const titleLines = doc.splitTextToSize(project.book_title || 'Untitled', contentWidth)
    const titleY = 90
    doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(14)
    doc.setTextColor(100)
    doc.text(`by ${authorName}`, pageWidth / 2, titleY + titleLines.length * 12 + 8, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(160)
    doc.text('Story & Scene Descriptions', pageWidth / 2, titleY + titleLines.length * 12 + 22, { align: 'center' })

    // --- Content pages ---
    for (const page of pages) {
      doc.addPage()
      let y = margin

      // Page header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 180)
      doc.text(`Page ${page.page_number}`, margin, y)
      y += 4
      doc.setDrawColor(200)
      doc.line(margin, y, pageWidth - margin, y)
      y += 8

      // Story text
      if (page.story_text) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.setTextColor(30)
        const storyLines = doc.splitTextToSize(page.story_text, contentWidth)
        for (const line of storyLines) {
          if (y > 270) { doc.addPage(); y = margin }
          doc.text(line, margin, y)
          y += 5.5
        }
      }

      // Scene description (optional)
      if (includeScenes && page.scene_description) {
        y += 6
        if (y > 255) { doc.addPage(); y = margin }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(120, 80, 160)
        doc.text('Scene Description', margin, y)
        y += 5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(80)
        const sceneLines = doc.splitTextToSize(page.scene_description, contentWidth)
        for (const line of sceneLines) {
          if (y > 270) { doc.addPage(); y = margin }
          doc.text(line, margin, y)
          y += 4.5
        }

        // Character chips
        const actions = page.character_actions as Record<string, string> | null
        if (actions && Object.keys(actions).length > 0) {
          y += 3
          if (y > 265) { doc.addPage(); y = margin }
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(8)
          doc.setTextColor(100, 80, 140)
          const charNames = Object.keys(actions).join('  ·  ')
          doc.text(`Characters: ${charNames}`, margin, y)
        }
      }
    }

    const pdfBuffer = doc.output('arraybuffer')

    const safeTitle = (project.book_title || 'story')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim()

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeTitle}_Story.pdf"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error generating story PDF:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to generate story PDF') },
      { status: 500 }
    )
  }
}
