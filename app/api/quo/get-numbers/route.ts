import { NextResponse } from 'next/server'

// Helper endpoint to get your Quo.com phone numbers
export async function GET() {
  const apiKey = process.env.QUO_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'QUO_API_KEY not configured' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch('https://api.openphone.com/v1/phone-numbers', {
      method: 'GET',
      headers: {
        'Authorization': apiKey,
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      return NextResponse.json(
        {
          error: `Quo.com API error: ${response.status}`,
          details: errorData,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Extract phone numbers in a more readable format
    const phoneNumbers = data.data?.map((num: any) => ({
      id: num.id,
      phoneNumber: num.phoneNumber || num.number || num.from,
      userId: num.userId,
      name: num.name,
    })) || []

    return NextResponse.json({
      success: true,
      phoneNumbers: phoneNumbers,
      raw: data, // Include raw response for debugging
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch phone numbers',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

