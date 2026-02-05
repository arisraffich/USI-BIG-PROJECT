import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notifications/email'
import { getLineArtUrls } from '@/lib/line-art/storage'
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

        // Get line art URLs from storage
        const lineArtFiles = await getLineArtUrls(projectId)

        if (lineArtFiles.length === 0) {
            return NextResponse.json({ error: 'No line art found. Generate line art first.' }, { status: 404 })
        }

        // Get illustration URLs
        const { data: pages, error: pagesError } = await supabase
            .from('pages')
            .select('page_number, illustration_url')
            .eq('project_id', projectId)
            .not('illustration_url', 'is', null)
            .order('page_number', { ascending: true })

        if (pagesError) {
            return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
        }

        // Build ZIP
        const zip = new JSZip()
        const lineArtFolder = zip.folder('Line Art')!
        const illustrationsFolder = zip.folder('Illustrations')!

        const downloadPromises: Promise<void>[] = []

        // Add line art
        for (const file of lineArtFiles) {
            downloadPromises.push(
                fetch(file.url)
                    .then(async (res) => {
                        if (res.ok) {
                            const buf = await res.arrayBuffer()
                            lineArtFolder.file(`lineart ${file.pageNumber}.png`, buf)
                        }
                    })
                    .catch(() => {})
            )
        }

        // Add illustrations
        if (pages) {
            for (const page of pages) {
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
        }

        await Promise.all(downloadPromises)

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        // Build email
        const customerName = [project.author_firstname, project.author_lastname]
            .filter(Boolean)
            .join(' ') || 'Unknown Customer'

        const safeTitle = (project.book_title || 'lineart')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .trim()

        await sendEmail({
            to: 'info@usillustrations.com',
            subject: `${customerName}'s project is ready for coloring`,
            html: `
                <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
                    <p style="margin-bottom: 16px;"><strong>${customerName}'s</strong> project is ready for coloring.</p>
                    <p style="margin-bottom: 16px;">Please download LineArt and Colored illustrations from the attached ZIP file.</p>
                    <p style="margin-bottom: 8px; color: #666; font-size: 14px;">Book: ${project.book_title || 'Untitled'}</p>
                </div>
            `,
            attachments: [{
                filename: `${safeTitle}_LineArt.zip`,
                content: zipBuffer,
            }],
        })

        console.log(`[Email] LineArt email sent for ${customerName}'s project`)

        return NextResponse.json({ success: true, message: 'Email sent' })

    } catch (error: unknown) {
        console.error('[Email] Error sending line art email:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to send email') },
            { status: 500 }
        )
    }
}
