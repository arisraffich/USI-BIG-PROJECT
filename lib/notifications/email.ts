import * as nodemailer from 'nodemailer'

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const username = process.env.SMTP_USERNAME || 'info@usillustrations.com'
  const password = process.env.SMTP_PASSWORD

  console.log(`[Email] Creating transporter with host: ${host}, port: ${port}, username: ${username}`)
  console.log(`[Email] Password is ${password ? 'set' : 'NOT SET'}`)

  if (!password) {
    const error = new Error('SMTP_PASSWORD environment variable is not set')
    console.error('[Email] Configuration error:', error.message)
    throw error
  }

  // Handle both ESM and CJS imports
  const createTransport = (nodemailer as any).default?.createTransport || nodemailer.createTransport || (nodemailer as any).createTransporter

  return createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: username,
      pass: password,
    },
    // Add debug logging
    debug: true,
    logger: true,
  })
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  from?: string
}): Promise<void> {
  try {
    console.log(`[Email] Creating transporter for ${process.env.SMTP_HOST || 'smtp.gmail.com'}`)
    const transporter = createTransporter()
    const from = options.from || 'US Illustrations <info@usillustrations.com>'

    console.log(`[Email] Sending email to ${options.to} with subject: ${options.subject}`)

    // Anti-Threading footer to prevent Gmail from collapsing emails
    // Uses hidden div with timestamp + random string
    const uniqueFooter = `<div style="display:none; max-height:0px; overflow:hidden;">${Date.now()}-${Math.random()}</div>`
    const finalHtml = options.html + uniqueFooter

    const result = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: finalHtml,
    })
    console.log(`[Email] Email sent successfully. Message ID: ${result.messageId}`)
  } catch (error: any) {
    console.error('[Email] Error sending email:', error)
    console.error('[Email] Error code:', error.code)
    console.error('[Email] Error response:', error.response)
    console.error('[Email] Error command:', error.command)
    throw new Error(`Failed to send email: ${error.message}`)
  }
}
