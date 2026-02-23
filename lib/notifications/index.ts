import { sendEmail } from './email'
import { sendSlackNotification } from './slack'
import { getErrorMessage } from '@/lib/utils/error'
import { renderTemplate } from '@/lib/email/renderer'

export async function notifyCustomerSubmission(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
  characters?: Array<{
    name?: string
    role?: string
    age?: string
    gender?: string
    description?: string
    skin_color?: string
    hair_color?: string
    hair_style?: string
    eye_color?: string
    clothing?: string
    accessories?: string
    special_features?: string
  }>
}): Promise<void> {
  const { projectId: _projectId, projectTitle, authorName, projectUrl, characters } = options

  try {
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Customer Submission*\n${authorName} has submitted character forms for "${projectTitle}".`,
        },
      },
    ]

    if (characters && characters.length > 0) {
      for (const char of characters) {
        const charName = char.name || char.role || 'Character'
        const details: string[] = []
        
        if (char.age) details.push(`Age: ${char.age}`)
        if (char.gender) details.push(`Gender: ${char.gender}`)
        if (char.description) details.push(`Description: ${char.description}`)
        if (char.skin_color) details.push(`Skin: ${char.skin_color}`)
        if (char.hair_color) details.push(`Hair Color: ${char.hair_color}`)
        if (char.hair_style) details.push(`Hair Style: ${char.hair_style}`)
        if (char.eye_color) details.push(`Eyes: ${char.eye_color}`)
        if (char.clothing) details.push(`Clothing: ${char.clothing}`)
        if (char.accessories) details.push(`Accessories: ${char.accessories}`)
        if (char.special_features) details.push(`Special: ${char.special_features}`)

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${charName}*\n${details.join('\n')}`,
          },
        })
      }
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Project' },
          url: projectUrl,
          style: 'primary',
        },
      ],
    })

    await sendSlackNotification({
      text: `📝 Customer submitted character forms for "${projectTitle}"`,
      blocks,
    })
  } catch (slackError: unknown) {
    console.error('Slack notification failed:', slackError)
  }
}

export async function notifyCharacterReview(options: {
  projectTitle: string
  authorName: string
  characterName: string
  feedbackText: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, characterName, feedbackText, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `📝 New Character Review: ${authorName} added feedback for ${characterName}`,
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
  } catch (slackError: unknown) {
    console.error('Slack notification failed:', slackError)
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
  const { projectTitle, authorName, authorEmail, reviewUrl, projectUrl } = options
  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  try {
    const rendered = await renderTemplate('define_secondary_characters', {
      authorFirstName,
      projectTitle,
      reviewUrl,
    })

    if (rendered) {
      await sendEmail({ to: authorEmail, subject: rendered.subject, html: rendered.html })
    } else {
      console.warn('[Notification] Template define_secondary_characters not found, using fallback')
      await sendEmail({
        to: authorEmail,
        subject: `Defining Secondary Characters for Your Book`,
        html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;"><h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Stage 1: Defining Secondary Characters</h2><p style="margin-bottom: 16px;">Hi ${authorFirstName},</p><p style="margin-bottom: 16px;">With your Main Character ready, it is time to define the rest of the cast.</p><p style="margin-bottom: 16px;">Please click the link below to describe your secondary characters (age, style, clothing, etc.):</p><p style="margin: 24px 0;"><a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Define Characters</a></p><p style="margin-bottom: 16px;">Once submitted, our artists will start illustrating them for your review.</p><p style="margin-bottom: 8px;">Best regards,</p><p style="font-weight: bold;">US Illustrations Team</p></div>`,
      })
    }
  } catch (emailError: unknown) {
    console.error('[Notification] Failed to send customer notification email:', emailError)
    console.error('[Notification] Email error details:', {
      message: getErrorMessage(emailError),
      code: emailError instanceof Error ? (emailError as any).code : undefined,
      response: emailError instanceof Error ? (emailError as any).response : undefined,
      stack: emailError instanceof Error ? emailError.stack : undefined,
    })
  }

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
  } catch (slackError: unknown) {
    console.error('Failed to send Slack notification:', slackError)
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

  try {
    const rendered = await renderTemplate('characters_ready_review', {
      authorFirstName,
      projectTitle,
      reviewUrl,
    })

    if (rendered) {
      await sendEmail({ to: authorEmail, subject: rendered.subject, html: rendered.html })
    } else {
      console.warn('[Notification] Template characters_ready_review not found, using fallback')
      await sendEmail({
        to: authorEmail,
        subject: `Review Your Secondary Characters`,
        html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;"><h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Stage 2: Character Illustrations Approval</h2><p style="margin-bottom: 16px;">Hi ${authorFirstName},</p><p style="margin-bottom: 16px;">The illustrations for your secondary characters are complete and ready for review.</p><p style="margin-bottom: 16px;">Please access your project dashboard below to view them:</p><p style="margin: 24px 0;"><a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Characters</a></p><p style="margin-bottom: 16px;">We will proceed to the next steps once all characters are approved.</p><p style="margin-bottom: 8px;">Best regards,</p><p style="font-weight: bold;">US Illustrations Team</p></div>`,
      })
    }
  } catch (emailError: unknown) {
    console.error('[Notification] Failed to send Stage 2 email:', emailError)
  }

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
  } catch (slackError: unknown) {
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

  try {
    const rendered = await renderTemplate('character_revisions', {
      authorFirstName,
      projectTitle,
      reviewUrl,
      revisionRound: String(revisionRound),
    })

    if (rendered) {
      await sendEmail({ to: authorEmail, subject: rendered.subject, html: rendered.html })
    } else {
      console.warn('[Notification] Template character_revisions not found, using fallback')
      await sendEmail({
        to: authorEmail,
        subject: `Round ${revisionRound} Review: Secondary Characters`,
        html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;"><h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Stage 2: Character Revisions | Round ${revisionRound}</h2><p style="margin-bottom: 16px;">Hi ${authorFirstName},</p><p style="margin-bottom: 16px;">We have updated your secondary characters based on your recent feedback.</p><ul style="margin-bottom: 16px;"><li style="margin-bottom: 8px;"><strong>Request Edits:</strong> If further adjustments are still needed.</li><li style="margin-bottom: 8px;"><strong>Approve:</strong> If the changes are correct.</li></ul><p style="margin-bottom: 16px;">We will finalize the characters once everything is approved.</p><p style="margin: 24px 0;"><a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review Characters</a></p><p style="margin-bottom: 8px;">Best regards,</p><p style="font-weight: bold;">US Illustrations Team</p></div>`,
      })
    }
  } catch (emailError: unknown) {
    console.error('[Notification] Failed to send revision email:', emailError)
  }

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
  } catch (slackError: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('Failed to send character approval notification:', error)
  }
}

// notifyIllustrationTrialSent REMOVED - trial phase no longer exists
// All sketches are now sent at once using notifyAllSketchesSent

export async function notifyAllSketchesSent(options: {
  projectTitle: string
  authorName: string
  authorEmail: string
  authorPhone?: string
  reviewUrl: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, reviewUrl, projectUrl } = options
  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName

  try {
    const rendered = await renderTemplate('all_sketches_ready', {
      authorFirstName,
      projectTitle,
      reviewUrl,
    })

    if (rendered) {
      await sendEmail({ to: authorEmail, subject: rendered.subject, html: rendered.html })
    } else {
      console.warn('[Notification] Template all_sketches_ready not found, using fallback')
      await sendEmail({
        to: authorEmail,
        subject: `Stage 3: Your Sketches Are Ready for Review`,
        html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;"><h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">All Sketches Ready</h2><p style="margin-bottom: 16px;">Hi ${authorFirstName},</p><p style="margin-bottom: 16px;">Great news – all your illustration sketches are ready for review!</p><p style="margin-bottom: 16px;">Please take your time going through each page. If anything needs adjusting, just click <strong>Request Revisions</strong> and add your notes. Once everything looks good, click <strong>Approve Sketches</strong> and we'll move forward with the final coloring.</p><p style="margin-bottom: 16px;">Review them here:</p><p style="margin: 24px 0;"><a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review All Sketches</a></p><p style="margin-bottom: 16px;">Looking forward to hearing what you think!</p><p style="margin-bottom: 8px;">Best,</p><p style="font-weight: bold;">US Illustrations Team</p></div>`,
      })
    }
  } catch (emailError: unknown) {
    console.error('[Notification] Failed to send all sketches email:', emailError)
  }

  try {
    await sendSlackNotification({
      text: `📚 All Sketches sent to customer for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📚 *All Sketches Sent*\nAll illustration sketches for "${projectTitle}" have been sent to ${authorName} for review.`,
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'View Project', emoji: true },
            url: projectUrl,
          },
        },
      ],
    })
  } catch (slackError: unknown) {
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
  revisionRound?: number
}): Promise<void> {
  const { projectTitle, authorName, authorEmail, reviewUrl, projectUrl, revisionRound } = options
  const authorFirstName = authorName.trim().split(/\s+/)[0] || authorName
  const roundText = revisionRound ? ` | Round ${revisionRound}` : ''

  try {
    const rendered = await renderTemplate('sketches_revised', {
      authorFirstName,
      projectTitle,
      reviewUrl,
      roundText,
    })

    if (rendered) {
      await sendEmail({ to: authorEmail, subject: rendered.subject, html: rendered.html })
    } else {
      console.warn('[Notification] Template sketches_revised not found, using fallback')
      await sendEmail({
        to: authorEmail,
        subject: `Stage 3: Sketches Revised${roundText}`,
        html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;"><h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Sketches Revised${roundText}</h2><p style="margin-bottom: 16px;">Hi ${authorFirstName},</p><p style="margin-bottom: 16px;">We've made the changes you requested – take a look at the updated sketches and let us know what you think.</p><p style="margin-bottom: 16px;">If it still needs some tweaking, no problem – just click <strong>Request Revisions</strong> and send over your notes. If everything looks good, click <strong>Approve Sketches</strong> and we'll move forward with the final coloring stage.</p><p style="margin-bottom: 16px;">You can review them here:</p><p style="margin: 24px 0;"><a href="${reviewUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review Sketches</a></p><p style="margin-bottom: 8px;">Talk soon,</p><p style="font-weight: bold;">US Illustrations Team</p></div>`,
      })
    }
  } catch (emailError: unknown) {
    console.error('[Notification] Failed to send sketches revision email:', emailError)
  }

  try {
    await sendSlackNotification({
      text: `🔄 Sketches Revised${roundText} - sent to customer for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sketches Revised${roundText}*\nRevisions for "${projectTitle}" by ${authorName} have been sent for review.`,
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
  } catch (slackError: unknown) {
    console.error('Failed to send Slack notification:', slackError)
  }
}

export async function notifyIllustrationsApproved(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
}): Promise<void> {
  const { projectId, projectTitle, authorName, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `✅ Sketches APPROVED for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sketches Approved*\n${authorName} has approved all sketches for "${projectTitle}".\nReady for production!`,
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
  } catch (error: unknown) {
    console.error('Failed to send illustration approval notification:', error)
  }
}

export async function notifyIllustrationFeedback(options: {
  projectId: string
  projectTitle: string
  authorName: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `📝 Illustration feedback submitted for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Illustration Feedback*\n${authorName} has requested revisions for "${projectTitle}".`,
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
  } catch (error: unknown) {
    console.error('Failed to send illustration feedback notification:', error)
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('Failed to send character review notification:', error)
  }
}

export async function notifyCustomerAcceptedReply(options: {
  projectTitle: string
  authorName: string
  pageNumber: number
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, pageNumber, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `✅ Customer Accepted Illustrator Note for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Illustrator Note Accepted*\n${authorName} accepted your illustrator note for *Page ${pageNumber}* in "${projectTitle}".`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '✅ The revision has been marked as resolved.',
            },
          ],
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
  } catch (error: unknown) {
    console.error('Failed to send accepted reply notification:', error)
  }
}

export async function notifyCustomerFollowUp(options: {
  projectTitle: string
  authorName: string
  pageNumber: number
  followUpText: string
  projectUrl: string
}): Promise<void> {
  const { projectTitle, authorName, pageNumber, followUpText, projectUrl } = options

  try {
    await sendSlackNotification({
      text: `💬 Customer Follow-up for "${projectTitle}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Customer Follow-up*\n${authorName} replied to your illustrator note for *Page ${pageNumber}* in "${projectTitle}".`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> ${followUpText.substring(0, 500)}${followUpText.length > 500 ? '...' : ''}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '⏳ Awaiting your response.',
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View & Reply' },
              url: projectUrl,
              style: 'primary',
            },
          ],
        },
      ],
    })
  } catch (error: unknown) {
    console.error('Failed to send follow-up notification:', error)
  }
}
