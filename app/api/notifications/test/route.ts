import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/notifications/email'
import { sendSMS } from '@/lib/notifications/sms'
import { sendSlackNotification } from '@/lib/notifications/slack'

export async function GET() {
  const results: any = {
    email: { success: false, message: '' },
    sms: { success: false, message: '' },
    slack: { success: false, message: '' },
  }

  // Test Email
  try {
    const testEmail = process.env.TEST_EMAIL || 'info@usillustrations.com'
    console.log(`[Test] Attempting to send test email to ${testEmail}`)
    await sendEmail({
      to: testEmail,
      subject: 'Test Email from USI Platform',
      html: '<p>This is a test email from the USI Platform notification system.</p>',
    })
    results.email = { success: true, message: `Email sent successfully to ${testEmail}` }
  } catch (error: any) {
    console.error('[Test] Email error:', error)
    results.email = { success: false, message: error.message || 'Email failed' }
  }

  // Test SMS
  try {
    const testPhone = process.env.TEST_PHONE_NUMBER || process.env.QUO_PHONE_NUMBER
    if (!testPhone) {
      results.sms = { success: false, message: 'TEST_PHONE_NUMBER or QUO_PHONE_NUMBER not set in environment variables' }
    } else {
      console.log(`[Test] Attempting to send test SMS to ${testPhone}`)
      await sendSMS({
        to: testPhone,
        message: 'Test SMS from USI Platform notification system.',
      })
      results.sms = { success: true, message: `SMS sent successfully to ${testPhone}` }
    }
  } catch (error: any) {
    console.error('[Test] SMS error:', error)
    results.sms = { success: false, message: error.message || 'SMS failed' }
  }

  // Test Slack
  try {
    console.log('[Test] Attempting to send test Slack notification')
    await sendSlackNotification({
      text: '🧪 Test notification from USI Platform',
    })
    results.slack = { success: true, message: 'Slack notification sent successfully' }
  } catch (error: any) {
    console.error('[Test] Slack error:', error)
    results.slack = { success: false, message: error.message || 'Slack failed' }
  }

  return NextResponse.json({
    success: true,
    results,
  })
}






