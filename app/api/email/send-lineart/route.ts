import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notifications/email'
import { getLineArtUrls } from '@/lib/line-art/storage'
import { uploadToR2 } from '@/lib/storage/r2'
import JSZip from 'jszip'
import { getErrorMessage } from '@/lib/utils/error'
import { renderTemplate } from '@/lib/email/renderer'

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
        const illustrationsFolder = zip.folder('Color References')!

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

        const customerName = [project.author_firstname, project.author_lastname]
            .filter(Boolean)
            .join(' ') || 'Unknown Customer'

        const safeTitle = (project.book_title || 'lineart')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .trim()

        const zipFilename = `${safeTitle}_LineArt.zip`
        const zipSizeMB = (zipBuffer.length / (1024 * 1024)).toFixed(1)

        // Upload ZIP to Cloudflare R2 (auto-deleted after 3 days by lifecycle rule)
        const r2Key = `${projectId}/${zipFilename}`
        const downloadUrl = await uploadToR2(r2Key, zipBuffer)

        console.log(`[Email] ZIP uploaded to R2: ${zipSizeMB}MB → ${downloadUrl}`)

        // Build email with download link instead of attachment
        const rendered = await renderTemplate('send_lineart_internal', {
            customerName,
            bookTitle: project.book_title || 'Untitled',
        })

        const downloadButtonHtml = `
            <div style="margin: 24px 0;">
                <a href="${downloadUrl}" 
                   style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">
                    Download Line Art (${zipSizeMB} MB)
                </a>
            </div>
            <p style="font-size: 13px; color: #999;">This link expires in 3 days.</p>`

        const fallbackHtml = `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
            <p style="margin-bottom: 16px;"><strong>${customerName}'s</strong> project is ready for coloring.</p>
            <p style="margin-bottom: 16px;">Download the LineArt and Colored illustrations below:</p>
            ${downloadButtonHtml}
            <p style="margin-bottom: 8px; color: #666; font-size: 14px;">Book: ${project.book_title || 'Untitled'}</p>
        </div>`

        const emailHtml = rendered?.html
            ? rendered.html + downloadButtonHtml
            : fallbackHtml

        await sendEmail({
            to: 'info@usillustrations.com',
            subject: rendered?.subject || `${customerName}'s project is ready for coloring`,
            html: emailHtml,
        })

        console.log(`[Email] LineArt email sent for ${customerName}'s project (download link, ${zipSizeMB}MB)`)

        return NextResponse.json({ success: true, message: 'Email sent' })

    } catch (error: unknown) {
        console.error('[Email] Error sending line art email:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to send email') },
            { status: 500 }
        )
    }
}
