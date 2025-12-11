/**
 * Normalize phone number to E.164 format (+1234567890)
 * Handles formats like: (508) 300-9508, 508-300-9508, 5083009508, +15083009508
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '')

  // If it doesn't start with +, assume US number and add +1
  if (!cleaned.startsWith('+')) {
    // If it starts with 1, add +
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = '+' + cleaned
    } else {
      // Otherwise, assume it's a 10-digit US number
      cleaned = '+1' + cleaned
    }
  }

  return cleaned
}

/**
 * NOTE: To make SMS messages appear as coming from "US Illustrations" in the recipient's phone:
 * 
 * The Quo.com/OpenPhone API does not support updating the phone number display name via API.
 * You must set it manually in the Quo.com dashboard:
 * 
 * 1. Log into your Quo.com/OpenPhone account
 * 2. Go to Settings > Phone Numbers
 * 3. Click on your phone number (+15082160785)
 * 4. In the "General" section, change the name to "US Illustrations"
 * 5. Save the changes
 * 
 * Once set, SMS messages sent from this number will appear as coming from "US Illustrations"
 * in the recipient's phone notifications (depending on carrier and phone OS support).
 */

export async function sendSMS(options: {
  to: string
  message: string
}): Promise<void> {
  const apiKey = process.env.QUO_API_KEY
  const fromNumber = process.env.QUO_PHONE_NUMBER

  if (!apiKey) {
    throw new Error('QUO_API_KEY environment variable is not set')
  }

  if (!fromNumber) {
    throw new Error('QUO_PHONE_NUMBER environment variable is not set')
  }

  // Normalize phone numbers to E.164 format
  const normalizedTo = normalizePhoneNumber(options.to)
  const normalizedFrom = normalizePhoneNumber(fromNumber)

  try {
    // console.log(`[SMS] Sending SMS to ${normalizedTo} (original: ${options.to}) from ${normalizedFrom}`)
    // console.log(`[SMS] Message length: ${options.message.length} characters`)

    // Get phone number ID if we need it
    // First, try to get the phone number ID for the from number
    let fromId: string | null = null
    try {
      const numbersResponse = await fetch('https://api.openphone.com/v1/phone-numbers', {
        headers: { 'Authorization': apiKey },
      })
      if (numbersResponse.ok) {
        const numbersData = await numbersResponse.json()
        const matchingNumber = numbersData.data?.find((num: any) =>
          num.number === fromNumber || num.formattedNumber?.includes(fromNumber.replace('+1', ''))
        )
        if (matchingNumber) {
          fromId = matchingNumber.id
          console.log(`[SMS] Found phone number ID: ${fromId} for ${fromNumber}`)
          console.log(`[SMS] Phone number display name: "${matchingNumber.name}"`)
          if (matchingNumber.name !== 'US Illustrations') {
            console.log(`[SMS] NOTE: To show "US Illustrations" as sender, update the phone number name in Quo.com dashboard`)
          }
        }
      }
    } catch (err) {
      console.log('[SMS] Could not fetch phone number ID, will use phone number directly')
    }

    // Quo.com API (formerly OpenPhone) endpoint
    // API expects: content (not text), to as array, from as phone number ID (PN...) or E.164 format
    // Try with phone number ID first if available, otherwise use phone number
    const fromValue = fromId || fromNumber
    console.log(`[SMS] Using 'from' value: ${fromValue}`)

    let response = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': apiKey, // Matches get-numbers route that works
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: [normalizedTo], // Must be an array, E.164 format
        from: fromValue, // Phone number ID (PN...) or E.164 format: +15082160785
        content: options.message, // Use 'content' not 'text'
      }),
    })

    // If 401, try with Bearer prefix
    if (response.status === 401) {
      console.log('[SMS] Got 401, retrying with Bearer prefix')
      response = await fetch('https://api.openphone.com/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: [normalizedTo],
          from: fromValue,
          content: options.message,
        }),
      })
    }

    const responseText = await response.text()
    console.log(`[SMS] API response status: ${response.status}`)
    console.log(`[SMS] API response body: ${responseText}`)

    if (!response.ok) {
      console.error(`[SMS] API error: ${response.status} ${responseText}`)
      throw new Error(`SMS API error: ${response.status} ${responseText}`)
    }

    let result
    try {
      result = JSON.parse(responseText)
      console.log(`[SMS] SMS sent successfully. Response:`, JSON.stringify(result, null, 2))
    } catch (parseError) {
      console.log(`[SMS] Response is not JSON, raw response: ${responseText}`)
      result = { raw: responseText }
    }
  } catch (error: any) {
    console.error('[SMS] Error sending SMS:', error)
    console.error('[SMS] Error details:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    })
    throw new Error(`Failed to send SMS: ${error.message}`)
  }
}
