import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notifications/email'

/**
 * Send Karine Coloring Request
 * 
 * Sends an email to info@usillustrations.com requesting Karine to colorize
 * the 1st illustration. Includes sketch and illustration as attachments.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Get project info (customer name + review token)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, author_firstname, author_lastname, book_title, review_token')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Get Page 1's illustration and sketch URLs
    const { data: page1, error: pageError } = await supabase
      .from('pages')
      .select('id, page_number, illustration_url, sketch_url')
      .eq('project_id', id)
      .eq('page_number', 1)
      .single()

    if (pageError || !page1) {
      return NextResponse.json(
        { error: 'Page 1 not found' },
        { status: 404 }
      )
    }

    if (!page1.illustration_url) {
      return NextResponse.json(
        { error: 'Page 1 illustration has not been generated yet' },
        { status: 400 }
      )
    }

    // Build customer name
    const customerName = [project.author_firstname, project.author_lastname]
      .filter(Boolean)
      .join(' ') || 'Unknown Customer'

    // Build URLs
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const projectUrl = `${baseUrl}/admin/project/${id}?tab=illustrations`
    const customerUrl = project.review_token 
      ? `${baseUrl}/review/${project.review_token}?tab=illustrations`
      : null

    // Build email
    const subject = '1st Illustration Coloring Request'
    const html = `
      <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
        <p style="margin-bottom: 16px;">Hi Karine,</p>
        <p style="margin-bottom: 16px;">Please colorize the 1st illustration attached for <strong>${customerName}'s</strong> project.</p>
        <p style="margin-bottom: 16px;">Once the image is ready, please upload it here:</p>
        <p style="margin: 24px 0;">
          <a href="${projectUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Upload Image</a>
        </p>
        ${customerUrl ? `
        <p style="margin-top: 24px; margin-bottom: 16px;">See customer view below:</p>
        <p style="margin: 24px 0;">
          <a href="${customerUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Customer View</a>
        </p>
        ` : ''}
        <p style="margin-bottom: 8px;">Thank you!</p>
      </div>
    `

    // Build attachments
    const attachments: { filename: string; path: string }[] = []
    
    if (page1.sketch_url) {
      attachments.push({
        filename: `${customerName.replace(/\s+/g, '_')}_Page1_Sketch.jpg`,
        path: page1.sketch_url
      })
    }
    
    if (page1.illustration_url) {
      attachments.push({
        filename: `${customerName.replace(/\s+/g, '_')}_Page1_Illustration.jpg`,
        path: page1.illustration_url
      })
    }

    // Send email
    await sendEmail({
      to: 'info@usillustrations.com',
      subject,
      html,
      attachments
    })

    console.log(`[Karine Request] Email sent for project ${id} (${customerName})`)

    return NextResponse.json({
      success: true,
      message: 'Email sent to Karine'
    })

  } catch (error: any) {
    console.error('Error sending Karine request:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
