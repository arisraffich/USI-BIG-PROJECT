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

    // Get project info (customer name)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, author_firstname, author_lastname, book_title')
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

    // Build email
    const subject = '1st Illustration Coloring Request'
    const html = `
      <p>Hi Karine,</p>
      <p>Please colorize the 1st illustration attached for <strong>${customerName}'s</strong> project.</p>
      <p>Thank you!</p>
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
