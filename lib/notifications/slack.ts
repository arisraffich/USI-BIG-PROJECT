import { getErrorMessage } from '@/lib/utils/error'

export async function sendSlackNotification(options: {
  text: string
  blocks?: any[]
}): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL environment variable is not set')
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: options.text,
        blocks: options.blocks,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Slack API error: ${response.status} ${errorText}`)
    }
  } catch (error: unknown) {
    console.error('Error sending Slack notification:', error)
    throw new Error(`Failed to send Slack notification: ${getErrorMessage(error)}`)
  }
}
