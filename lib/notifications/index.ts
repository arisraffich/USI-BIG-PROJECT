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

  // Send email to customer
  try {
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
  if (false && authorPhone) { // Temporarily disabled request by user
    try {
      await sendSMS({
        to: authorPhone as string,
        message: `Hi ${authorFirstName}, your project "${projectTitle}" is ready for review! Check your email (including spam) for the review link: ${reviewUrl} - US Illustrations`,
      })
    } catch (smsError: any) {
      console.error('[Notification] Failed to send customer SMS:', smsError)
      console.error('[Notification] SMS error details:', {
        message: smsError.message,
        stack: smsError.stack,
      })
      // Don't throw - we still want to notify Slack even if SMS fails
    }
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

export async function notifyCharactersApproved(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `🎉 Characters APPROVED for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Characters Approved*\n${authorName} has approved the characters for "${projectTitle}".\nProject is ready for Illustration Phase.`,
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
    console.error('Failed to send character approval notification:', error)
  }
}

export async function notifyIllustrationTrialSent(options: {
  projectTitle: string
  authorName: string
  authorEmail: string
  authorPhone?: string
  reviewUrl: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, authorPhone, reviewUrl, projectUrl } = options

  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  // Send email to customer
  try {
    await sendEmail({
      to: authorEmail,
      subject: `Illustration Trial Ready: "${projectTitle}"`,
      html: `
        <h2>Your Illustration Trial is Ready</h2>
        <p>Hello ${authorFirstName},</p>
        <p>Great news! We have prepared the initial illustration trial for your project "<strong>${projectTitle}</strong>".</p>
        <p>Please review the illustration and sketch for the first page and let us know what you think:</p>
        <p style="margin: 20px 0;">
          <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review Illustration Trial</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${reviewUrl}</p>
        <p>Thank you!</p>
        <p>US Illustrations Team</p>
      `,
    })
  } catch (emailError: any) {
    console.error('[Notification] Failed to send illustration trial email:', emailError)
  }

  // Send SMS (DISABLED temporarily per user request condition)
  if (false && authorPhone) {
    // ...
  }

  // Send Slack notification to PM
  try {
    await sendSlackNotification({
      text: `🎨 Illustration Trial sent to customer for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Illustration Trial Sent*\nTrial illustration for "${projectTitle}" by ${authorName} has been sent for review.`,
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
  }
}

export async function notifyIllustrationsUpdate(options: {
  projectTitle: string
  authorName: string
  authorEmail: string
  authorPhone?: string
  reviewUrl: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, authorPhone, reviewUrl, projectUrl } = options

  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  // Send email to customer
  try {
    await sendEmail({
      to: authorEmail,
      subject: `New Illustrations Ready: "${projectTitle}"`,
      html: `
        <h2>New Illustrations Are Ready</h2>
        <p>Hello ${authorFirstName},</p>
        <p>We have uploaded new illustrations for your project "<strong>${projectTitle}</strong>".</p>
        <p>Please review the latest updates:</p>
        <p style="margin: 20px 0;">
          <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review Illustrations</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${reviewUrl}</p>
        <p>Thank you!</p>
        <p>US Illustrations Team</p>
      `,
    })
  } catch (emailError: any) {
    console.error('[Notification] Failed to send illustration update email:', emailError)
  }

  // Send Slack notification to PM
  try {
    await sendSlackNotification({
      text: `🎨 New Illustrations sent to customer for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*New Illustrations Sent*\nUpdated illustrations for "${projectTitle}" by ${authorName} have been sent for review.`,
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
  }
}

export async function notifyCustomerReview(options: {
  projectTitle: string
  authorName: string
  pageNumber: number
  feedbackText: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, pageNumber, feedbackText, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `📝 New Customer Review for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*New Customer Review*\n${authorName} added a review for *Page ${pageNumber}* of "${projectTitle}".`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> ${feedbackText}`,
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
    console.error('Failed to send customer review notification:', error)
  }
}
