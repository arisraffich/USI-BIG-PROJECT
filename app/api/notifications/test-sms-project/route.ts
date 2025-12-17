import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/notifications/sms'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createAdminClient()
    
    // Get the first project with a phone number
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, author_phone, author_email')
      .not('author_phone', 'is', null)
      .limit(1)
      .single()

    if (error || !projects) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No project found with customer phone number',
          details: error?.message 
        },
        { status: 404 }
      )
    }

    const customerPhone = projects.author_phone
    const customerFirstName = projects.author_firstname || 'Customer'
    const customerFullName = `${projects.author_firstname} ${projects.author_lastname}`.trim()
    const bookTitle = projects.book_title

    console.log(`[Test SMS] Sending test SMS to customer: ${customerFullName} (${customerPhone}) for project: ${bookTitle}`)

    // Send test SMS (using first name only)
    await sendSMS({
      to: customerPhone,
      message: `Hello ${customerFirstName}! This is a test SMS from USI Platform for your project "${bookTitle}". Your review link will be sent when the project is ready for review.`,
    })

    return NextResponse.json({
      success: true,
      message: `Test SMS sent successfully to ${customerFirstName}`,
      details: {
        customerFirstName,
        customerFullName,
        customerPhone,
        bookTitle,
        projectId: projects.id,
      },
    })
  } catch (error: any) {
    console.error('[Test SMS] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send test SMS',
        details: error.message,
      },
      { status: 500 }
    )
  }
}








