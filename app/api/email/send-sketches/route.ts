import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notifications/email'
import JSZip from 'jszip'
import { getErrorMessage } from '@/lib/utils/error'

export const maxDuration = 120

export async function POST(request: NextRequest) {
    try {
        const { projectId } = await request.json()

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // Get project info
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, book_title, author_firstname, author_lastname')
            .eq('id', projectId)
            .single()

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Get all pages
        const { data: pages, error: pagesError } = await supabase
            .from('pages')
            .select('page_number, sketch_url, illustration_url')
            .eq('project_id', projectId)
            .order('page_number', { ascending: true })

        if (pagesError || !pages || pages.length === 0) {
            return NextResponse.json({ error: 'No pages found' }, { status: 404 })
        }

        // Build ZIP
        const zip = new JSZip()
        const sketchesFolder = zip.folder('Sketches')!
        const illustrationsFolder = zip.folder('Illustrations')!

        const downloadPromises: Promise<void>[] = []

        for (const page of pages) {
            if (page.sketch_url) {
                downloadPromises.push(
                    fetch(page.sketch_url)
                        .then(async (res) => {
                            if (res.ok) {
                                const buf = await res.arrayBuffer()
                                sketchesFolder.file(`sketch ${page.page_number}.png`, buf)
                            }
                        })
                        .catch(() => {})
                )
            }
            if (page.illustration_url) {
                downloadPromises.push(
                    fetch(page.illustration_url)
                        .then(async (res) => {
                            if (res.ok) {
                                const buf = await res.arrayBuffer()
                                illustrationsFolder.file(`illustration ${page.page_number}.png`, buf)
                            }
                        })
                        .catch(() => {})
                )
            }
        }

        await Promise.all(downloadPromises)

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        // Build email
        const customerName = [project.author_firstname, project.author_lastname]
            .filter(Boolean)
            .join(' ') || 'Unknown Customer'

        const safeTitle = (project.book_title || 'sketches')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .trim()

        await sendEmail({
            to: 'info@usillustrations.com',
            subject: `${customerName}'s project is ready for coloring`,
            html: `
                <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
                    <p style="margin-bottom: 16px;"><strong>${customerName}'s</strong> project is ready for coloring.</p>
                    <p style="margin-bottom: 16px;">Please download Sketches and Colored illustrations from the attached ZIP file.</p>
                    <p style="margin-bottom: 8px; color: #666; font-size: 14px;">Book: ${project.book_title || 'Untitled'}</p>
                </div>
            `,
            attachments: [{
                filename: `${safeTitle}_Sketches.zip`,
                content: zipBuffer,
            }],
        })

        console.log(`[Email] Sketches email sent for ${customerName}'s project`)

        return NextResponse.json({ success: true, message: 'Email sent' })

    } catch (error: unknown) {
        console.error('[Email] Error sending sketches email:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to send email') },
            { status: 500 }
        )
    }
}
