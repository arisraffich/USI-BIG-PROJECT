import OpenAI from 'openai'
import { getErrorMessage } from '@/lib/utils/error'

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  : null

export async function parseCharacterForm(pdfBuffer: Buffer) {
  // Import PDF parser utility
  const { parsePdf } = await import('@/lib/utils/pdf-parser')

  let rawText: string
  try {
    rawText = await parsePdf(pdfBuffer)
    // console.log('[parseCharacterForm] PDF extracted text length:', rawText.length)
  } catch (pdfError: unknown) {
    console.error('Error extracting PDF text:', getErrorMessage(pdfError))
    throw new Error(`Failed to extract text from PDF: ${getErrorMessage(pdfError)}`)
  }

  if (!rawText || rawText.trim().length < 10) {
    console.error('PDF text is too short or empty')
    throw new Error('PDF appears to be empty or unreadable')
  }

  const prompt = `You are extracting character information from a Character Form PDF. Extract the following fields from the form text.

PDF Form Text:
${rawText}

Look for these fields in the form (they may be labeled as):
- Character Name / Character's Name / Name
- Character Description / Biography / About Character / Background / Summary
- Character's Age / Age
- Character's Gender / Gender
- Character's Ethnicity / Ethnicity
- Character's Skin Color / Skin Color
- Character's Hair Color / Hair Color
- Character's Hair Style / Hair Style
- Character's Eye Color / Eye Color
- Character's Clothing / Clothing
- Accessories (if mentioned separately)
- Special Features / Any Special Features

Extract these exact fields (use null if field is missing, empty, or says "N/A"):

- name: character's name (string or null)
- biography: shorter character description or biography (string or null). Keep it under 2 sentences if possible, summarizing role and personality.
- age: character's age (string or null)
- ethnicity: character's ethnicity (string or null)
- skin_color: skin color description (string or null)
- hair_color: hair color description (string or null)
- hair_style: hair style description (string or null)
- eye_color: eye color description (string or null)
- clothing: clothing description with style and color (string or null)
- accessories: accessories description (string or null) - if not mentioned separately, can be null
- special_features: any special features or notes (string or null)
- gender: character's gender (string or null)

Rules:
- If a field says "N/A", "n/a", "N.A.", or similar, return null
- If a field says "Illustrator's choice", return that exact text
- If a field is blank/empty, return null
- Keep original text exactly as written (don't modify or interpret) unless summarizing biography
- Extract the actual values, not the field labels
- For "Mixed" ethnicity, include the full description (e.g., "Mixed - Indian and African American")

Return valid JSON only with this structure:
{
  "name": "...",
  "biography": "...",
  "age": "...",
  "ethnicity": "...",
  "skin_color": "...",
  "hair_color": "...",
  "hair_style": "...",
  "eye_color": "...",
  "clothing": "...",
  "accessories": "...",
  "special_features": "...",
  "gender": "..."
}`

  if (!openai) {
    console.error('[parseCharacterForm] OpenAI API key is missing')
    // Return empty result instead of crashing
    return createEmptyCharacterData()
  }

  try {
    console.log('[parseCharacterForm] Sending request to OpenAI...')
    const completion = await openai.responses.create({
      model: 'gpt-5.2',
      input: prompt,
      text: {
        format: { type: 'json_object' }
      },
      reasoning: {
        effort: 'none' // Pure data extraction, no reasoning needed
      }
    })

    console.log('[parseCharacterForm] OpenAI response received')
    const result = await processCompletion(completion)
    console.log('[parseCharacterForm] Extraction result:', JSON.stringify(result, null, 2))
    return result
  } catch (error: unknown) {
    console.error('[parseCharacterForm] OpenAI API Error:', getErrorMessage(error))
    // Return empty data on failure so process can continue
    return createEmptyCharacterData()
  }
}

function createEmptyCharacterData() {
  return {
    name: null,
    biography: null,
    age: null,
    ethnicity: null,
    skin_color: null,
    hair_color: null,
    hair_style: null,
    eye_color: null,
    clothing: null,
    accessories: null,
    special_features: null,
    gender: null,
  }
}

async function processCompletion(completion: any) {
  // Find the message output (not reasoning)
  const messageOutput = completion.output?.find((o: any) => o.type === 'message')
  let content = '{}'
  if (messageOutput && 'content' in messageOutput) {
    const firstContent = messageOutput.content?.[0]
    content = (firstContent && 'text' in firstContent ? firstContent.text : null) || '{}'
  }

  let result
  try {
    result = JSON.parse(content)
  } catch (parseError: unknown) {
    console.error('Failed to parse OpenAI JSON response:', getErrorMessage(parseError))
    // Return empty on parse error
    return createEmptyCharacterData()
  }

  // Validate required structure
  const requiredFields = [
    'name',
    'biography',
    'age',
    'ethnicity',
    'skin_color',
    'hair_color',
    'hair_style',
    'eye_color',
    'clothing',
    'accessories',
    'special_features',
    'gender',
  ]

  for (const field of requiredFields) {
    if (!(field in result)) {
      result[field] = null
    }
  }

  return result
}


