import { sendEmail } from './email'
import { sendSlackNotification } from './slack'
import { sendSMS } from './sms'

export async function notifyCustomerSubmission(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
}): Promise<void> {
  const { projectId, projectTitle, authorName, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `📝 Customer submitted character changes for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Customer Submission*\n${authorName} has submitted character changes for "${projectTitle}".`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Project' },
              url: projectUrl,
              style: 'primary',
            },
          ],
        },
      ],
    })
  } catch (slackError: any) {
    console.error('Slack notification failed:', slackError)
    // Don't send email fallback - only notify via Slack
  }
}

export async function notifyProjectSentToCustomer(options: {
  projectTitle: string
  authorName: string
  authorEmail: string
  authorPhone?: string
  reviewUrl: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, authorPhone, reviewUrl, projectUrl } = options

  // Extract first name only (for customer-facing messages)
  // Split by space and take the first part, or use the full name if no space
  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  console.log(`[Notification] Sending project to customer: ${projectTitle}, email: ${authorEmail}, phone: ${authorPhone || 'not provided'}`)

  // Send email to customer
  try {
    console.log(`[Notification] Attempting to send email to ${authorEmail}`)
    await sendEmail({
      to: authorEmail,
      subject: `Your project "${projectTitle}" is ready for review`,
      html: `
        <h2>Your Project is Ready for Review</h2>
        <p>Hello ${authorFirstName},</p>
        <p>Your project "<strong>${projectTitle}</strong>" is now ready for your review and input.</p>
        <p>Please review the characters and story pages, and make any necessary changes:</p>
        <p style="margin: 20px 0;">
          <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review Your Project</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${reviewUrl}</p>
        <p>Thank you!</p>
        <p>US Illustrations Team</p>
      `,
    })
    console.log(`[Notification] Email sent successfully to ${authorEmail}`)
  } catch (emailError: any) {
    console.error('[Notification] Failed to send customer notification email:', emailError)
    console.error('[Notification] Email error details:', {
      message: emailError.message,
      code: emailError.code,
      response: emailError.response,
      stack: emailError.stack,
    })
    // Don't throw - we still want to send SMS and notify Slack even if email fails
  }

  // Send SMS to customer if phone number is provided
  if (authorPhone) {
    try {
      console.log(`[Notification] Attempting to send SMS to ${authorPhone}`)
      await sendSMS({
        to: authorPhone,
        message: `Hi ${authorFirstName}, your project "${projectTitle}" is ready for review! Check your email (including spam) for the review link: ${reviewUrl} - US Illustrations`,
      })
      console.log(`[Notification] SMS sent successfully to ${authorPhone}`)
    } catch (smsError: any) {
      console.error('[Notification] Failed to send customer SMS:', smsError)
      console.error('[Notification] SMS error details:', {
        message: smsError.message,
        stack: smsError.stack,
      })
      // Don't throw - we still want to notify Slack even if SMS fails
    }
  } else {
    console.log('[Notification] No phone number provided, skipping SMS')
  }

  // Send Slack notification to PM
  try {
    await sendSlackNotification({
      text: `📧 Project "${projectTitle}" sent to customer for review`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Project Sent to Customer*\n"${projectTitle}" by ${authorName} has been sent for customer review.`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Project' },
              url: projectUrl,
              style: 'primary',
            },
          ],
        },
      ],
    })
  } catch (slackError: any) {
    console.error('Failed to send Slack notification:', slackError)
    // Don't send email fallback - only notify via Slack
  }
}

export async function notifyCharacterGenerationComplete(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
  generatedCount: number
  failedCount: number
}): Promise<void> {
  const { projectTitle, authorName, projectUrl, generatedCount, failedCount } = options

  try {
    await sendSlackNotification({
      text: `✅ Character generation complete for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Character Generation Complete*\n${generatedCount} character${generatedCount !== 1 ? 's' : ''} generated for "${projectTitle}" by ${authorName}.${failedCount > 0 ? `\n⚠️ ${failedCount} failed.` : ''}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Project' },
              url: projectUrl,
              style: 'primary',
            },
          ],
        },
      ],
    })
  } catch (error: any) {
    console.error('Failed to send character generation notification:', error)
  }
}
