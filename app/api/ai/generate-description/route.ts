import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/ai/openai'
import { createErrorResponse, createValidationError } from '@/lib/utils/api-error'

export async function POST(request: NextRequest) {
  try {
    const { story_text, character_names, current_notes } = await request.json()

    if (!story_text) {
      return createValidationError('story_text is required')
    }

    let prompt = ''

    if (current_notes && current_notes.trim().length > 5) {
      // Scenario B: Refine existing notes
      prompt = `Refine and enhance the following illustration notes for a children's book scene.
        
Current Notes: "${current_notes}"
Story Context: "${story_text}"
${character_names && character_names.length > 0 ? `Characters present: ${character_names.join(', ')}` : ''}

Goal: clarify the environment, identify main/secondary characters, improve composition description, and make it suitable for an illustrator.
Format: 2-3 sentences.
Style: Storybook illustration, hand-drawn aesthetic.`
    } else {
      // Scenario A: Generate purely from story
      prompt = `Create a visual scene description for a children's book illustration in 2-3 sentences:

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
    }

    if (!openai) {
      return createErrorResponse(
        new Error('OpenAI API key is not configured'),
        'OpenAI API key is not configured',
        500
      )
    }

    const completion = await openai.responses.create({
      model: 'gpt-5.2',
      input: prompt,
      reasoning: {
        effort: 'none' // Creative descriptions don't need reasoning
      }
    })

    // Find the message output (not reasoning)
    const messageOutput = completion.output?.find((o: any) => o.type === 'message')
    let description = ''
    if (messageOutput && 'content' in messageOutput) {
      const firstContent = messageOutput.content?.[0]
      description = (firstContent && 'text' in firstContent ? firstContent.text?.trim() : null) || ''
    }

    return NextResponse.json({ description })
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate description', 500)
  }
}

