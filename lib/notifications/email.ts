import { Resend } from 'resend'
import { getErrorMessage } from '@/lib/utils/error'

const resend = new Resend(process.env.RESEND_API_KEY)

// Attachment type for Resend
interface EmailAttachment {
  filename: string
  path?: string // URL to fetch the file from
  content?: Buffer // Or raw content
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  from?: string
  attachments?: EmailAttachment[]
}): Promise<void> {
  const from = options.from || 'US Illustrations <info@usillustrations.com>'

  console.log(`[Email] Sending email via Resend to ${options.to} with subject: ${options.subject}`)
  if (options.attachments?.length) {
    console.log(`[Email] With ${options.attachments.length} attachment(s)`)
  }

  // Anti-Threading footer to prevent Gmail from collapsing emails
  const uniqueFooter = `<div style="display:none; max-height:0px; overflow:hidden;">${Date.now()}-${Math.random()}</div>`
  const finalHtml = options.html + uniqueFooter

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: finalHtml,
      attachments: options.attachments,
    })

    if (error) {
      console.error('[Email] Resend error:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }

    console.log(`[Email] Email sent successfully via Resend. ID: ${data?.id}`)
  } catch (error: unknown) {
    console.error('[Email] Error sending email:', error)
    throw new Error(`Failed to send email: ${getErrorMessage(error)}`)
  }
}
