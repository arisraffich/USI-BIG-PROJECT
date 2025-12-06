import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/ai/openai'
import { createErrorResponse, createValidationError } from '@/lib/utils/api-error'

export async function POST(request: NextRequest) {
  try {
    const { story_text, character_names } = await request.json()

    if (!story_text) {
      return createValidationError('story_text is required')
    }

    const prompt = `Create a visual scene description for a children's book illustration in 2-3 sentences:

Story text: "${story_text}"
${character_names && character_names.length > 0
  ? `Characters mentioned: ${character_names.join(', ')}`
  : ''}

Format your response as exactly 3 sentences:
- Sentence 1: Main action and characters
- Sentence 2: Setting and environment details  
- Sentence 3: Mood, lighting, and composition

Focus on: storybook illustration style, hand-drawn aesthetic, warm and inviting atmosphere, child-friendly visuals. 
Avoid: photorealistic details, complex technical elements, adult themes.`

    if (!openai) {
      return createErrorResponse(
        new Error('OpenAI API key is not configured'),
        'OpenAI API key is not configured',
        500
      )
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1', // Updated to GPT-5.1 with low reasoning
      messages: [{ role: 'user', content: prompt }],
      reasoning_effort: 'low', // Low reasoning for creative descriptions
      // Note: temperature is not supported with reasoning_effort other than 'none'
    })

    const description = completion.choices[0].message.content?.trim() || ''

    return NextResponse.json({ description })
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate description', 500)
  }
}

