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

// AI-powered story parsing using GPT-5.1
export async function parsePagesWithAI(storyText: string): Promise<Array<{
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
}>> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured')
  }

  const prompt = `You are parsing a children's book story file to extract ONLY the relevant text for each illustration.

STORY FILE CONTENT:
${storyText}

TASK:
Extract ONLY the story text and scene descriptions for each illustration. Ignore all metadata, notes, ideas, and non-story content.

CRITICAL RULES:

1. IDENTIFY ILLUSTRATION MARKERS:
   - Look for patterns like "Illustration 1", "Illustration 2", "Page 1", "Page 2", etc.
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
- description_auto_generated: boolean (false if description was in file, true if we need to generate later)

Example output format:
{
  "pages": [
    {
      "page_number": 1,
      "story_text": "Zara and her mom loved to snuggle on the sofa reading and telling each other stories. Zara turned to her mom and asked if she could tell her about when she was born.",
      "scene_description": null,
      "description_auto_generated": false
    },
    {
      "page_number": 2,
      "story_text": "Her mom got comfortable and began \"Once upon a time, my sweet Zara,\" her mom began, as she nestled beside her in the cozy, dimly lit bedroom, there was a baby who came into the world a little earlier than expected...",
      "scene_description": null,
      "description_auto_generated": false
    }
  ]
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      reasoning_effort: 'none', // Fast parsing, no complex reasoning needed
      temperature: 0, // For consistent extraction
    }).catch((error: any) => {
      console.error('OpenAI API Error in parsePagesWithAI:', error.message)
      throw error
    })

    const content = completion.choices[0].message.content || '{"pages": []}'
    const result = JSON.parse(content)
    
    if (!result.pages || !Array.isArray(result.pages)) {
      throw new Error('Invalid response format from AI')
    }

    // Sort pages by page_number
    result.pages.sort((a: any, b: any) => a.page_number - b.page_number)

    return result.pages.map((page: any) => ({
      page_number: page.page_number,
      story_text: page.story_text || '',
      scene_description: page.scene_description || null,
      description_auto_generated: page.description_auto_generated || false,
    }))
  } catch (error: any) {
    console.error('Error parsing story with AI:', error.message)
    // Fallback to pattern-based parsing if AI fails
    return parsePages(storyText)
  }
}


