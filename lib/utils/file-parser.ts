import mammoth from 'mammoth'
import { openai } from '@/lib/ai/openai'

export async function parseStoryFile(
  fileBuffer: Buffer,
  fileType: string
): Promise<string> {
  let text: string

  if (fileType === 'application/pdf') {
    // Import PDF parser utility
    const { parsePdf } = await import('@/lib/utils/pdf-parser')
    text = await parsePdf(fileBuffer)
  } else if (
    fileType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer })
    text = result.value
  } else if (fileType === 'text/plain') {
    text = fileBuffer.toString('utf-8')
  } else {
    throw new Error('Unsupported file type')
  }

  return text
}

export function parsePages(text: string) {
  const pages: Array<{
    page_number: number
    story_text: string
    scene_description: string | null
    description_auto_generated: boolean
    character_actions?: Record<string, string> | null
    background_elements?: string | null
    atmosphere?: string | null
  }> = []

  // Split by lines but keep empty lines for context
  const rawLines = text.split('\n')

  // Process lines - trim but don't filter empty ones yet (we need to preserve structure)
  const lines = rawLines.map((l) => l.trim())

  let currentPage: (typeof pages)[0] | null = null
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines but continue processing
    if (!line) {
      i++
      continue
    }

    // Check if line contains "Illustration X" pattern (can be anywhere in the line)
    const match = line.match(/Illustration\s+(\d+)/i)

    if (match) {
      // Save previous page if it exists
      if (currentPage) {
        pages.push(currentPage)
      }

      // Start new page (all pages processed identically)
      const pageNumber = parseInt(match[1])
      currentPage = {
        page_number: pageNumber,
        story_text: '',
        scene_description: null,
        description_auto_generated: false,
      }

      // If there's text after "Illustration X" on the same line, add it to the page
      // Text before "Illustration X" is ignored (like title/header text)
      const matchEnd = match.index! + match[0].length
      const afterMatch = line.substring(matchEnd).trim()
      if (afterMatch && !afterMatch.toLowerCase().startsWith('description:')) {
        currentPage.story_text = afterMatch
      }

      i++
      continue
    }

    // Check if line is description
    if (line.toLowerCase().startsWith('description:')) {
      if (currentPage) {
        currentPage.scene_description = line
          .replace(/^description:\s*/i, '')
          .trim()
      }
      i++
      continue
    }

    // Otherwise, it's story text
    // Only add text if we have a current page (content before any Illustration marker is ignored)
    if (currentPage) {
      currentPage.story_text +=
        (currentPage.story_text ? ' ' : '') + line
    }
    i++
  }

  // Save the last page (ensures the final page is included)
  if (currentPage) {
    pages.push(currentPage)
  }

  // Sort pages by page_number to ensure correct order
  pages.sort((a, b) => a.page_number - b.page_number)

  return pages
}

// AI-powered story parsing using GPT-5.2
export async function parsePagesWithAI(storyText: string): Promise<Array<{
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
  character_actions?: Record<string, string> | null
  background_elements?: string | null
  atmosphere?: string | null
}>> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured')
  }

  // STEP 1: Parse story structure and extract pages
  const parsingPrompt = `You are a professional storyboard creator parsing a children's book story file to extract ONLY the relevant text for each illustration.

STORY FILE CONTENT:
${storyText}

TASK:
Extract ONLY the story text and scene descriptions for each illustration. Ignore all metadata, notes, ideas, and non-story content.

CRITICAL RULES:

1. IDENTIFY ILLUSTRATION MARKERS:
   - Look for patterns like "Illustration 1", "Illustration 2", "Page 1", "Page 2", etc.
   - Handle all formats uniformly (Word documents, PDFs, plain text)
   - Detect page breaks and section markers intelligently
   - The number after "Illustration" or "Page" is the page_number

2. EXTRACT STORY TEXT:
   - Extract ONLY the narrative text that belongs to that illustration
   - Include dialogue, actions, and descriptions that are part of the story
   - Stop when you reach the next illustration marker or non-story content

3. EXTRACT SCENE DESCRIPTIONS:
   - If you see "Description:" followed by text, extract that as scene_description
   - If no description is present, set scene_description to null

4. IGNORE THESE COMPLETELY:
   - Title/metadata at the top (e.g., "Zara's Journey: A Tale of Courage and Love Across Borders. Size: ???")
   - Sections labeled "Possible ideas for pages", "Notes", "Ideas", etc.
   - Any text in numbered lists that are suggestions or ideas (e.g., "1. **Zara and Her Mom Reading**: An illustration...")
   - Random notes like "No microphone ??"
   - Any text that is clearly not part of the actual story narrative

5. TEXT CLEANUP:
   - Remove any leading/trailing whitespace
   - Preserve paragraph breaks within story text
   - Keep dialogue and narrative exactly as written
   - Do NOT add or modify any story content

6. HANDLE EDGE CASES:
   - If story text appears on the same line as "Illustration X", include it
   - If story text continues on multiple lines after the marker, include all of it
   - If there's text between illustrations that isn't clearly story content, skip it
   - If an illustration has no story text, still create a page entry with empty story_text

Return a JSON object with a "pages" array. Each page should have:
- page_number: integer (from Illustration marker)
- story_text: string (the actual story narrative for this illustration, cleaned)
- scene_description: string | null (if "Description:" was found, otherwise null)
- description_auto_generated: boolean (false if description was in file, true if description needs to be generated)

Example output format:
{
  "pages": [
    {
      "page_number": 1,
      "story_text": "Zara and her mom loved to snuggle on the sofa reading and telling each other stories. Zara turned to her mom and asked if she could tell her about when she was born.",
      "scene_description": null,
      "description_auto_generated": false
    }
  ]
}`

  let pages: Array<{
    page_number: number
    story_text: string
    scene_description: string | null
    description_auto_generated: boolean
  }>

  try {
    console.log('[parsePagesWithAI] Starting story parsing with GPT-5.2...')
    const completion = await openai.responses.create({
      model: 'gpt-5.2',
      input: parsingPrompt,
      text: {
        format: { type: 'json_object' }
      },
      reasoning: {
        effort: 'none' // Fast parsing, no complex reasoning needed
      }
    })

    // Find the message output (not reasoning)
    const messageOutput = completion.output?.find((o: any) => o.type === 'message')
    let content = '{"pages": []}'
    if (messageOutput && 'content' in messageOutput) {
      const firstContent = messageOutput.content?.[0]
      content = (firstContent && 'text' in firstContent ? firstContent.text : null) || '{"pages": []}'
    }
    console.log('[parsePagesWithAI] Raw AI response length:', content.length)
    const result = JSON.parse(content)

    if (!result.pages || !Array.isArray(result.pages)) {
      console.error('[parsePagesWithAI] Invalid JSON structure:', JSON.stringify(result).substring(0, 200))
      throw new Error('Invalid response format from AI: missing or invalid pages array')
    }

    console.log(`[parsePagesWithAI] Successfully parsed ${result.pages.length} pages.`)

    // Sort pages by page_number
    result.pages.sort((a: any, b: any) => a.page_number - b.page_number)

    pages = result.pages.map((page: any) => ({
      page_number: page.page_number,
      story_text: page.story_text || '',
      scene_description: page.scene_description || null,
      description_auto_generated: page.description_auto_generated || false,
    }))
  } catch (error: any) {
    const errorMessage = error.message || String(error)
    console.error('Error parsing story with GPT-5.2:', errorMessage)
    console.error('Full parsing error details:', error)
    throw new Error(`Failed to parse story with GPT-5.2: ${errorMessage}`)
  }

  // STEP 2: Generate descriptions for pages that don't have them (sequential)
  const pagesWithDescriptions = await Promise.all(
    pages.map(async (page) => {
      // If page already has a description from the file, enhance it to cover all 3 topics
      if (page.scene_description && page.scene_description.trim().length > 0) {
        const enhancePrompt = `You are restructuring a scene description for a children's book illustration into a structured format.

ORIGINAL DESCRIPTION (by author):
"${page.scene_description}"

STORY TEXT (for context):
"${page.story_text}"

YOUR TASK:
Extract and structure this description into 3 components:

1. **character_actions**: Object with character names as keys and their actions/emotions as values
   - Format: {"CharacterName": "what they're doing and how they feel"}
   - Only include characters visible in THIS scene
   - If no specific characters, use general descriptions like {"child": "...", "parent": "..."}

2. **background_elements**: Text describing the environment/setting
   - Where the scene takes place
   - Objects, props, and visual details present
   - Single descriptive text string

3. **atmosphere**: Text describing mood and emotional tone
   - Lighting, weather, time of day
   - Emotional feeling of the scene
   - Single descriptive text string

CRITICAL RULES:
- IGNORE any meta-instructions like "This should emphasize...", "Make sure to include...", "The illustration should show...", etc.
- These are author notes TO YOU, NOT part of the scene description
- DO NOT include them in your output
- Preserve the author's descriptive words and phrases, but filter out instructions
- Keep the author's tone and style for actual scene elements
- Add ONLY what's missing to complete all 3 aspects

Focus on: preserving author intent, minimal additions, children's book illustration style, hand-drawn aesthetic, warm and inviting.

Return ONLY valid JSON in this exact format:
{
  "character_actions": {"CharacterName": "action description"},
  "background_elements": "environment description",
  "atmosphere": "mood and lighting description"
}`

        try {
          if (!openai) throw new Error('OpenAI API key is not configured')

          const enhanceCompletion = await openai.responses.create({
            model: 'gpt-5.2',
            input: enhancePrompt,
            text: {
              format: { type: 'json_object' }
            },
            reasoning: {
              effort: 'low' // Light reasoning to preserve author intent and balance topics
            }
          })

          // Find the message output (not reasoning)
          const messageOutput = enhanceCompletion.output?.find((o: any) => o.type === 'message')
          let enhancedJson = null
          if (messageOutput && 'content' in messageOutput) {
            const firstContent = messageOutput.content?.[0]
            const jsonText = (firstContent && 'text' in firstContent ? firstContent.text?.trim() : null) || null
            if (jsonText) {
              try {
                enhancedJson = JSON.parse(jsonText)
              } catch (parseError) {
                console.error(`Failed to parse JSON for page ${page.page_number}:`, parseError)
                enhancedJson = null
              }
            }
          }

          if (!enhancedJson || !enhancedJson.character_actions || !enhancedJson.background_elements || !enhancedJson.atmosphere) {
            console.warn(`GPT-5.2 returned invalid structured description for page ${page.page_number}, using original`)
            return {
              ...page,
              description_auto_generated: false,
            }
          }

          // Create display paragraph from structured data
          const characterParts = Object.entries(enhancedJson.character_actions)
            .map(([name, action]) => `${name} ${action}`)
            .join(', ')
          const displayParagraph = `${characterParts}. ${enhancedJson.background_elements}. ${enhancedJson.atmosphere}`

          console.log(`[Enhanced] Page ${page.page_number}: "${page.scene_description}" → Structured JSON`)

          return {
            ...page,
            scene_description: displayParagraph, // For display/backward compatibility
            character_actions: enhancedJson.character_actions,
            background_elements: enhancedJson.background_elements,
            atmosphere: enhancedJson.atmosphere,
            description_auto_generated: false, // Still author-provided, just enhanced
          }
        } catch (error: any) {
          const errorMessage = error.message || String(error)
          console.error(`Error enhancing description for page ${page.page_number}:`, errorMessage)
          // Fallback: use original description if enhancement fails
          console.warn(`Using original description for page ${page.page_number} after enhancement error`)
          return {
            ...page,
            description_auto_generated: false,
          }
        }
      }

      // If no description and no story text, skip generation
      if (!page.story_text || page.story_text.trim().length === 0) {
        return {
          ...page,
          description_auto_generated: false,
        }
      }

      // Generate description using GPT-5.2 as professional storyboard creator
      const descriptionPrompt = `You are a professional storyboard creator for children's books. Create a structured visual scene description for an illustration based on the story text.

Story text: "${page.story_text}"

Your task is to create a professional storyboard description structured into 3 components:

1. **character_actions**: Object with character names as keys and their actions/emotions as values
   - Format: {"CharacterName": "what they're doing and how they feel"}
   - Only include characters visible in THIS scene
   - If no specific characters named in text, use descriptive names like {"young girl": "...", "mother": "..."}
   - Analyze the story text to identify who is present

2. **background_elements**: Text describing the environment/setting
   - Where the scene takes place
   - Objects, props, and visual details present
   - What the illustrator should draw in the background
   - Single descriptive text string

3. **atmosphere**: Text describing mood and emotional tone
   - Lighting, weather, time of day
   - Emotional feeling and composition style
   - What mood should the illustration convey
   - Single descriptive text string

IMPORTANT:
- Write ONLY the visual scene description
- Do NOT include meta-instructions like "This should emphasize...", "Make sure to include...", etc.
- Write as if describing what you SEE in the illustration, not instructions about what should be done
- Analyze the story text carefully to determine which characters are present

Focus on: storybook illustration style, hand-drawn aesthetic, warm and inviting atmosphere, child-friendly visuals.
Avoid: photorealistic details, complex technical elements, adult themes, meta-instructions.

Return ONLY valid JSON in this exact format:
{
  "character_actions": {"CharacterName": "action description"},
  "background_elements": "environment description",
  "atmosphere": "mood and lighting description"
}`

      try {
        if (!openai) throw new Error('OpenAI API key is not configured')

        const descriptionCompletion = await openai.responses.create({
          model: 'gpt-5.2',
          input: descriptionPrompt,
          text: {
            format: { type: 'json_object' }
          },
          reasoning: {
            effort: 'low' // Light reasoning to analyze story and balance visual elements
          }
        })

        // Find the message output (not reasoning)
        const messageOutput = descriptionCompletion.output?.find((o: any) => o.type === 'message')
        let generatedJson = null
        if (messageOutput && 'content' in messageOutput) {
          const firstContent = messageOutput.content?.[0]
          const jsonText = (firstContent && 'text' in firstContent ? firstContent.text?.trim() : null) || null
          if (jsonText) {
            try {
              generatedJson = JSON.parse(jsonText)
            } catch (parseError) {
              console.error(`Failed to parse generated JSON for page ${page.page_number}:`, parseError)
              generatedJson = null
            }
          }
        }

        if (!generatedJson || !generatedJson.character_actions || !generatedJson.background_elements || !generatedJson.atmosphere) {
          throw new Error('GPT-5.2 returned invalid structured description')
        }

        // Create display paragraph from structured data
        const characterParts = Object.entries(generatedJson.character_actions)
          .map(([name, action]) => `${name} ${action}`)
          .join(', ')
        const displayParagraph = `${characterParts}. ${generatedJson.background_elements}. ${generatedJson.atmosphere}`

        console.log(`[Generated] Page ${page.page_number}: Structured JSON created`)

        return {
          ...page,
          scene_description: displayParagraph, // For display/backward compatibility
          character_actions: generatedJson.character_actions,
          background_elements: generatedJson.background_elements,
          atmosphere: generatedJson.atmosphere,
          description_auto_generated: true,
        }
      } catch (error: any) {
        const errorMessage = error.message || String(error)
        console.error(`Error generating description for page ${page.page_number} with GPT-5.2:`, errorMessage)
        throw new Error(`Failed to generate description for page ${page.page_number} with GPT-5.2: ${errorMessage}`)
      }
    })
  )

  return pagesWithDescriptions
}


