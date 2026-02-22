import mammoth from 'mammoth'
import { openai } from '@/lib/ai/openai'
import { getErrorMessage } from '@/lib/utils/error'

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
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error)
    console.error('Error parsing story with GPT-5.2:', errorMessage)
    console.error('Full parsing error details:', error)
    throw new Error(`Failed to parse story with GPT-5.2: ${errorMessage}`)
  }

  // STEP 2: Process scene descriptions using shared function
  const pagesWithDescriptions = await processSceneDescriptions(pages)
  return pagesWithDescriptions
}

// ============================================================================
// SHARED SCENE DESCRIPTION PROCESSING
// Used by both Path A (admin upload) and Path B (customer submission)
// ============================================================================

interface SceneDescriptionInput {
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
}

interface SceneDescriptionResult extends SceneDescriptionInput {
  character_actions?: Record<string, string> | null
  background_elements?: string | null
  atmosphere?: string | null
}

export async function processSceneDescriptions(
  pages: SceneDescriptionInput[]
): Promise<SceneDescriptionResult[]> {
  if (!openai) {
    console.error('[SceneDescriptions] OpenAI API key not configured — skipping')
    return pages.map(p => ({ ...p }))
  }

  // Split pages by what they need
  const toGenerate = pages.filter(p => (!p.scene_description || !p.scene_description.trim()) && p.story_text?.trim())
  const toEnhance = pages.filter(p => p.scene_description && p.scene_description.trim().length > 0)
  const skipped = pages.filter(p => (!p.scene_description || !p.scene_description.trim()) && !p.story_text?.trim())

  if (toGenerate.length === 0 && toEnhance.length === 0) {
    return pages.map(p => ({ ...p }))
  }

  console.log(`[SceneDescriptions] Processing ${toGenerate.length} to generate, ${toEnhance.length} to enhance, ${skipped.length} skipped`)

  // Build batched prompt for all pages that need processing
  const allToProcess = [...toGenerate, ...toEnhance].sort((a, b) => a.page_number - b.page_number)

  const pagesBlock = allToProcess.map(p => {
    const hasDesc = p.scene_description && p.scene_description.trim().length > 0
    return `PAGE ${p.page_number}:
Story text: "${p.story_text}"${hasDesc ? `\nAuthor's scene description: "${p.scene_description}"` : '\nNo scene description provided.'}`
  }).join('\n\n')

  const prompt = `You are a professional storyboard creator for children's book illustrations. Process the following pages.

For each page, produce:
1. **summary**: A concise 1-2 sentence summary of what the illustration shows — the key action and who is involved. Written for a human to quickly scan.
2. **character_actions**: Object with character names as keys and their actions/emotions as values. If no characters are named, use descriptive names like "young girl", "mother".
3. **background_elements**: Describe the environment, setting, props, and visual details the illustrator should draw. Be specific — include spatial layout, key objects, and visual elements. As detailed as the scene requires.
4. **atmosphere**: Describe the mood, lighting, weather, time of day, and emotional tone. Guide the scene's feel without specifying colors or art style.

RULES:
- If a page has an author's scene description, treat it as the primary visual source. Only supplement with details from the story text that are missing from the description. Filter out meta-instructions like "This should emphasize..." or "Make sure to include...".
- If a page has no scene description, create one from the story text.
- Write as if describing what you SEE in the illustration.
- Focus on: children's book illustration style, child-friendly visuals. Match the atmosphere to the tone of each page's text.
- Keep all text concise. No verbose paragraphs.

${pagesBlock}

Return ONLY valid JSON:
{
  "pages": [
    {
      "page_number": 1,
      "summary": "concise scene description",
      "character_actions": {"CharacterName": "action description"},
      "background_elements": "environment description",
      "atmosphere": "mood and lighting description"
    }
  ]
}`

  try {
    console.log(`[SceneDescriptions] Sending batched request for ${allToProcess.length} pages...`)
    const completion = await openai.responses.create({
      model: 'gpt-5.2',
      input: prompt,
      text: {
        format: { type: 'json_object' },
        verbosity: 'low'
      },
      reasoning: { effort: 'low' },
      max_output_tokens: 16000
    })

    const msgOut = completion.output?.find((o: any) => o.type === 'message')
    const jsonText = msgOut && 'content' in msgOut ? (msgOut as any).content?.[0]?.text?.trim() : null
    if (!jsonText) throw new Error('Empty response from GPT-5.2')

    const result = JSON.parse(jsonText)
    if (!result.pages || !Array.isArray(result.pages)) throw new Error('Invalid response: missing pages array')

    console.log(`[SceneDescriptions] Batch success — ${result.pages.length} pages returned`)

    // Build lookup from AI results
    const aiResults = new Map<number, any>()
    for (const p of result.pages) {
      if (p.page_number && p.character_actions && p.background_elements && p.atmosphere) {
        aiResults.set(p.page_number, p)
      }
    }

    // Merge results back into all pages
    return pages.map(page => {
      const ai = aiResults.get(page.page_number)
      if (!ai) return { ...page }

      const wasGenerated = !page.scene_description || !page.scene_description.trim()
      return {
        ...page,
        scene_description: ai.summary || page.scene_description,
        character_actions: ai.character_actions,
        background_elements: ai.background_elements,
        atmosphere: ai.atmosphere,
        description_auto_generated: wasGenerated,
      }
    })
  } catch (batchError: unknown) {
    console.error('[SceneDescriptions] Batch failed, falling back to parallel per-page:', getErrorMessage(batchError))
    return fallbackPerPage(pages, toGenerate, toEnhance)
  }
}

async function fallbackPerPage(
  allPages: SceneDescriptionInput[],
  toGenerate: SceneDescriptionInput[],
  toEnhance: SceneDescriptionInput[]
): Promise<SceneDescriptionResult[]> {
  if (!openai) return allPages.map(p => ({ ...p }))

  const results = new Map<number, SceneDescriptionResult>()

  const processPage = async (page: SceneDescriptionInput, mode: 'generate' | 'enhance') => {
    const input = mode === 'enhance'
      ? `You are restructuring a scene description for a children's book illustration.\n\nAuthor's description: "${page.scene_description}"\nStory text: "${page.story_text}"\n\nReturn JSON with: "summary" (concise 1-2 sentence scene description), "character_actions" (object), "background_elements" (string), "atmosphere" (string). Preserve the author's intent. Filter out meta-instructions.`
      : `You are creating a scene description for a children's book illustration.\n\nStory text: "${page.story_text}"\n\nReturn JSON with: "summary" (concise 1-2 sentence scene description), "character_actions" (object with character names as keys), "background_elements" (string), "atmosphere" (string). Children's book style, child-friendly visuals. Match the atmosphere to the tone of the text.`

    try {
      const completion = await openai!.responses.create({
        model: 'gpt-5.2',
        input,
        text: { format: { type: 'json_object' }, verbosity: 'low' },
        reasoning: { effort: 'low' },
        max_output_tokens: 1000
      })
      const msgOut = completion.output?.find((o: any) => o.type === 'message')
      const jsonText = msgOut && 'content' in msgOut ? (msgOut as any).content?.[0]?.text?.trim() : null
      const parsed = jsonText ? JSON.parse(jsonText) : null

      if (parsed?.character_actions && parsed?.background_elements && parsed?.atmosphere) {
        results.set(page.page_number, {
          ...page,
          scene_description: parsed.summary || page.scene_description,
          character_actions: parsed.character_actions,
          background_elements: parsed.background_elements,
          atmosphere: parsed.atmosphere,
          description_auto_generated: mode === 'generate',
        })
        console.log(`[SceneDescriptions] ${mode === 'generate' ? 'Generated' : 'Enhanced'} page ${page.page_number}`)
      }
    } catch (err: unknown) {
      console.error(`[SceneDescriptions] Failed ${mode} for page ${page.page_number}:`, getErrorMessage(err))
    }
  }

  // Process in parallel batches of 4
  const allWork = [
    ...toGenerate.map(p => () => processPage(p, 'generate')),
    ...toEnhance.map(p => () => processPage(p, 'enhance')),
  ]
  for (let i = 0; i < allWork.length; i += 4) {
    await Promise.all(allWork.slice(i, i + 4).map(fn => fn()))
  }

  return allPages.map(page => results.get(page.page_number) || { ...page })
}


