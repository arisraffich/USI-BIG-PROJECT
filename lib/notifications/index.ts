import { sendEmail } from './email'
import { sendSlackNotification } from './slack'
import { sendSMS } from './sms'

export async function notifyCustomerSubmission(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
}): Promise<void> {
  const { projectId: _projectId, projectTitle, authorName, projectUrl } = options

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
      subject: `Defining Secondary Characters for ${projectTitle}`,
      html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
          <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Stage 1: Defining Secondary Characters</h2>
          <p style="margin-bottom: 16px;">Hi ${authorFirstName},</p>
          <p style="margin-bottom: 16px;">With your Main Character ready, it is time to define the rest of the cast.</p>
          <p style="margin-bottom: 16px;">Please click the link below to describe your secondary characters (age, style, clothing, etc.):</p>
          <p style="margin: 24px 0;">
            <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Define Characters</a>
          </p>
          <p style="margin-bottom: 16px;">Once submitted, our artists will start illustrating them for your review.</p>
          <p style="margin-bottom: 8px;">Best regards,</p>
          <p style="font-weight: bold;">US Illustrations Team</p>
        </div>
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

export async function notifySecondaryCharactersReady(options: {
  projectTitle: string
  authorName: string
  authorEmail: string
  reviewUrl: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, reviewUrl, projectUrl } = options
  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  // Send email to customer
  try {
    await sendEmail({
      to: authorEmail,
      subject: `Review Secondary Characters for ${projectTitle}`,
      html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
          <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Stage 2: Character Illustrations Approval</h2>
          <p style="margin-bottom: 16px;">Hi ${authorFirstName},</p>
          <p style="margin-bottom: 16px;">The illustrations for your secondary characters are complete and ready for review.</p>
          <p style="margin-bottom: 16px;">Please access your project dashboard below to view them:</p>
          <p style="margin: 24px 0;">
            <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Characters</a>
          </p>
          <p style="margin-bottom: 16px;">We will proceed to the next steps once all characters are approved.</p>
          <p style="margin-bottom: 8px;">Best regards,</p>
          <p style="font-weight: bold;">US Illustrations Team</p>
        </div>
      `,
    })
  } catch (emailError: any) {
    console.error('[Notification] Failed to send Stage 2 email:', emailError)
  }

  // Send Slack notification to PM
  try {
    await sendSlackNotification({
      text: `📧 Secondary Characters sent for review: "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Secondary Characters Sent*\nReview email sent to ${authorName} for "${projectTitle}".`,
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

export async function notifyCharacterRevisions(options: {
  projectTitle: string
  authorName: string
  authorEmail: string
  reviewUrl: string
  projectUrl: string
  revisionRound: number
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, reviewUrl, projectUrl, revisionRound } = options
  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  // Send email to customer
  try {
    await sendEmail({
      to: authorEmail,
      subject: `Round ${revisionRound} Review: Secondary Characters for ${projectTitle}`,
      html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
          <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Stage 2: Character Revisions | <span style="color: #2563eb;">Round ${revisionRound}</span></h2>
          <p style="margin-bottom: 16px;">Hi ${authorFirstName},</p>
          <p style="margin-bottom: 16px;">We have updated your secondary characters based on your recent feedback.</p>
          <ul style="margin-bottom: 16px;">
            <li style="margin-bottom: 8px;"><strong>Request Edits:</strong> If further adjustments are still needed.</li>
            <li style="margin-bottom: 8px;"><strong>Approve:</strong> If the changes are correct.</li>
          </ul>
          <p style="margin-bottom: 16px;">We will finalize the characters once everything is approved.</p>
          <p style="margin: 24px 0;">
            <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review Characters</a>
          </p>
          <p style="margin-bottom: 8px;">Best regards,</p>
          <p style="font-weight: bold;">US Illustrations Team</p>
        </div>
      `,
    })
  } catch (emailError: any) {
    console.error('[Notification] Failed to send revision email:', emailError)
  }

  // Send Slack notification to PM
  try {
    await sendSlackNotification({
      text: `🔄 Character Revisions (Round ${revisionRound}) sent: "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Character Revisions Sent*\nRound ${revisionRound} review email sent to ${authorName} for "${projectTitle}".`,
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
      text: `✅ Characters Generated for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Characters Generated*\n${authorName} has submitted character forms.\n${generatedCount} character${generatedCount !== 1 ? 's' : ''} generated for "${projectTitle}" by ${authorName}.${failedCount > 0 ? `\n⚠️ ${failedCount} failed.` : ''}`,
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
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
          <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Your Illustration Trial is Ready</h2>
          <p style="margin-bottom: 16px;">Hello ${authorFirstName},</p>
          <p style="margin-bottom: 16px;">Great news! We have prepared the initial illustration trial for your project "<strong>${projectTitle}</strong>".</p>
          <p style="margin-bottom: 16px;">Please review the illustration and sketch for the first page and let us know what you think:</p>
          <p style="margin: 24px 0;">
            <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review Illustration Trial</a>
          </p>
          <p style="margin-bottom: 16px;">Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all; margin-bottom: 16px;">${reviewUrl}</p>
          <p style="margin-bottom: 8px;">Thank you!</p>
          <p style="font-weight: bold;">US Illustrations Team</p>
        </div>
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
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
          <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">New Illustrations Are Ready</h2>
          <p style="margin-bottom: 16px;">Hello ${authorFirstName},</p>
          <p style="margin-bottom: 16px;">We have uploaded new illustrations for your project "<strong>${projectTitle}</strong>".</p>
          <p style="margin-bottom: 16px;">Please review the latest updates:</p>
          <p style="margin: 24px 0;">
            <a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review Illustrations</a>
          </p>
          <p style="margin-bottom: 16px;">Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all; margin-bottom: 16px;">${reviewUrl}</p>
          <p style="margin-bottom: 8px;">Thank you!</p>
          <p style="font-weight: bold;">US Illustrations Team</p>
        </div>
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

export async function notifyCustomerCharacterReview(options: {
  projectTitle: string
  authorName: string
  characterName: string
  feedbackText: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, characterName, feedbackText, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `📝 New Character Review for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*New Character Review*\n${authorName} added a review for character *${characterName}* in "${projectTitle}".`,
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
    console.error('Failed to send character review notification:', error)
  }
}
