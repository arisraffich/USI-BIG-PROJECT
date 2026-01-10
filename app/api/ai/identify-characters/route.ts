import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { openai } from '@/lib/ai/openai'

// Hybrid filtering function to remove plural characters programmatically
function isPluralCharacter(nameOrRole: string | null): boolean {
  if (!nameOrRole) return false

  const text = nameOrRole.toLowerCase().trim()

  // Common plural endings
  const pluralEndings = ['s', 'es', 'ies']

  // Check if it ends with plural indicators
  if (pluralEndings.some(ending => text.endsWith(ending))) {
    // But exclude common singular words that end in 's'
    const singularExceptions = ['mom', 'dad', 'grandma', 'grandpa', 'class', 'glass', 'grass']
    if (singularExceptions.includes(text)) {
      return false
    }

    // Check for plural indicators in the text
    const pluralIndicators = [
      'many', 'several', 'group of', 'groups of', 'crowd of', 'crowds of',
      'people', 'children', 'kids', 'adults', 'teachers', 'doctors', 'nurses',
      'animals', 'dogs', 'cats', 'birds', 'friends', 'neighbors', 'family members'
    ]

    if (pluralIndicators.some(indicator => text.includes(indicator))) {
      return true
    }

    // If it's a role and ends in 's', likely plural (e.g., "Teachers", "Doctors")
    // But "Mom" or "Dad" are singular even though they could be plural contextually
    if (text.endsWith('s') && text.length > 3) {
      // Check if it's a known singular role
      const singularRoles = ['mom', 'dad', 'grandma', 'grandpa', 'teacher', 'doctor', 'nurse']
      if (!singularRoles.some(role => text.startsWith(role))) {
        return true // Likely plural
      }
    }
  }

  return false
}

// Safety Net: Fuzzy matching to detect if a character is likely the main character
function isLikelyMainCharacter(
  identifiedChar: any,
  mainCharacter: any
): boolean {
  if (!mainCharacter) return false

  const mainName = mainCharacter.name?.toLowerCase().trim() || ''
  const mainRole = mainCharacter.story_role?.toLowerCase().trim() ||
    mainCharacter.biography?.toLowerCase().trim() || ''

  const charName = identifiedChar.name?.toLowerCase().trim() || ''
  const charRole = identifiedChar.role?.toLowerCase().trim() || ''
  const charStoryRole = identifiedChar.story_role?.toLowerCase().trim() || ''

  // 1. Exact name match
  if (mainName && charName && charName === mainName) {
    return true
  }

  // 2. Name contains main name (e.g., "Zara" in "Zara the Explorer")
  if (mainName && charName && charName.includes(mainName) && mainName.length > 2) {
    return true
  }

  // 3. Main name contains character name (e.g., main is "Zara the Explorer", char is "Zara")
  if (mainName && charName && mainName.includes(charName) && charName.length > 2) {
    return true
  }

  // 4. Role matches main character description
  if (mainRole && (charRole.includes(mainRole) || mainRole.includes(charRole)) && mainRole.length > 3) {
    return true
  }

  // 5. Story role matches main character description
  if (mainRole && (charStoryRole.includes(mainRole) || mainRole.includes(charStoryRole)) && mainRole.length > 3) {
    return true
  }

  // 6. Check if character appears on many pages (main character trait)
  // Main characters typically appear on 50%+ of pages
  const appearsOnManyPages = identifiedChar.appears_in?.length > 0 &&
    identifiedChar.appears_in.length >= 3 // At least 3 pages

  // If unnamed character appears frequently, might be main character
  if (appearsOnManyPages && !charName && mainName) {
    // Be conservative - only flag if we have strong role match
    if (charRole && mainRole && (charRole.includes(mainRole) || mainRole.includes(charRole))) {
      return true
    }
  }

  return false
}

// Exported function for direct calls (e.g., from project creation)
export async function identifyCharactersForProject(project_id: string) {
  const supabase = await createAdminClient()
  
  // Run the character identification logic
  return await runCharacterIdentification(project_id, supabase)
}

// Core logic extracted for reusability
async function runCharacterIdentification(project_id: string, supabase: any) {

    // STEP 1: Fetch main character FIRST (before building prompt)
    // Use maybeSingle() instead of single() to avoid throwing on no results
    const { data: mainCharacter, error: mainCharError } = await supabase
      .from('characters')
      .select('id, name, role, story_role, age, gender, is_main')
      .eq('project_id', project_id)
      .eq('is_main', true)
      .maybeSingle()
    
    if (mainCharError) {
      console.warn(`[Character ID] Warning: Could not fetch main character: ${mainCharError.message}`)
    }
    
    console.log(`[Character ID] Main character query result: ${mainCharacter ? `Found (id: ${mainCharacter.id}, name: "${mainCharacter.name || 'NULL'}")` : 'Not found'}`)

    // STEP 2: Get all pages for this project
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', project_id)
      .order('page_number', { ascending: true })

    if (pagesError) {
      return NextResponse.json(
        { error: 'Failed to fetch pages', details: pagesError.message },
        { status: 500 }
      )
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        {
          error: 'No pages found for this project',
          details: 'Story parsing must complete successfully before character identification can run.',
        },
        { status: 404 }
      )
    }

    const maxPageNumber = pages.length

    // Build full story text
    const fullStory = pages
      .map((p: any) => `Page ${p.page_number}: ${p.story_text}`)
      .join('\n\n')

    // STEP 3: Build prompt for character identification
    // Main character name is provided by admin - we just need to identify secondary characters
    const mainCharName = mainCharacter?.name || null
    
    const prompt = `You are analyzing a children's book story to identify ALL characters that need to be illustrated.

${mainCharName ? `MAIN CHARACTER (already provided - DO NOT include in your response): "${mainCharName}"` : ''}

STORY:
${fullStory}

YOUR TASK: Identify all characters in this story that would need a character illustration form filled out.

CRITICAL RULES:

1. EXCLUDE READER/SECOND-PERSON REFERENCES:
   - DO NOT include "you" or "your" when it refers to the reader
   - If "you" is addressing the reader of the book, it is NOT a character
   - Only include "you" if it's a character's actual name in the story

2. NUMBERED/LABELED CHARACTERS ARE VALID:
   - Characters with numbers or labels (e.g., "Character 1", "Friend 2") are valid character names
   - Each numbered character is a SEPARATE individual
   - Treat these as proper character names

3. SINGULAR CHARACTERS ONLY:
   - Each character must be a specific, identifiable individual
   - Characters must be able to be illustrated as a single entity

4. EXCLUDE PLURAL/GROUP REFERENCES:
   - DO NOT identify groups like "the kids", "children", "people"
   - If a reference describes multiple entities, exclude it

5. INCLUDE SPECIFIC INDIVIDUALS:
   - Characters with proper names (e.g., "Max", "Mom", "Zara")
   - Characters with numbered labels (e.g., "Kid 1", "Kid 2")
   - Characters with descriptive titles (e.g., "the boy", "the girl")
   - If a character appears multiple times, they need a form

6. WRITER INTENT CHECK:
   - Would the writer want to fill out a character form for this?
   - INCLUDE: recurring characters, characters with physical descriptions
   - EXCLUDE: background mentions, generic placeholders

RESPONSE FORMAT:
Return a JSON object:
{
  "characters": [
    {
      "name": "Character name",
      "role": "Brief role description",
      "appears_in": [1, 2, 3, 5],
      "description": "Brief physical description from the story"
    }
  ]
}

IMPORTANT:
${mainCharName ? `- DO NOT include "${mainCharName}" - they are the main character (already handled)` : ''}
- DO NOT include reader-addressed "you" - the reader is NOT a character
- Each character must have a "name" field
- "appears_in" must be page numbers (1 to ${maxPageNumber})`

    if (!openai) {
      throw new Error('OpenAI API key is not configured')
    }

    // STEP 4: Call AI with GPT-5.2 (best model for reasoning)
    let completion
    try {
      console.log('[Character ID] Calling GPT-5.2 for analysis...')
      completion = await openai.responses.create({
        model: 'gpt-5.2',
        input: prompt,
        text: {
          format: { type: 'json_object' }
        },
        reasoning: {
          effort: 'high'
        }
      })
    } catch (error: any) {
      const errorMessage = error.message || String(error)
      console.error('OpenAI API Error in identify-characters:', errorMessage)
      console.error('Full API Error:', error)
      throw new Error(`Failed to identify characters with GPT-5.2: ${errorMessage}`)
    }

    // Find the message output (not reasoning)
    const messageOutput = completion.output?.find((o: any) => o.type === 'message')
    let responseContent = '{}'
    if (messageOutput && 'content' in messageOutput) {
      const firstContent = messageOutput.content?.[0]
      responseContent = (firstContent && 'text' in firstContent ? firstContent.text : null) || '{}'
    }
    console.log('[Character ID] Raw AI response length:', responseContent.length)
    console.log('[Character ID] Full completion object:', JSON.stringify(completion, null, 2))
    console.log('[Character ID] Response content:', responseContent)
    let identified

    try {
      identified = JSON.parse(responseContent)
    } catch (parseError) {
      console.error('[Character ID] Failed to parse AI response:', parseError)
      console.error('[Character ID] Response content:', responseContent.substring(0, 500))
      return NextResponse.json(
        { error: 'Invalid JSON response from AI', details: responseContent.substring(0, 200) },
        { status: 500 }
      )
    }

    // STEP 5: Validate response structure
    if (!identified.characters || !Array.isArray(identified.characters)) {
      console.error('[Character ID] Invalid response structure - missing characters array')
      throw new Error('Invalid response format from AI - missing characters array')
    }

    // STEP 6: Get main character name for filtering
    const mainCharNameForFiltering = mainCharacter?.name || null
    console.log(`[Character ID] Main character name for filtering: "${mainCharNameForFiltering || 'NULL'}"`)

    // STEP 7: SAFETY NET - Remove main character if AI accidentally included them
    let filteredCharacters = identified.characters
    const removedDuplicates: string[] = []

    // Filter using existing main character data (fuzzy matching)
    if (mainCharacter) {
      filteredCharacters = identified.characters.filter((char: any) => {
        if (isLikelyMainCharacter(char, mainCharacter)) {
          const identifier = char.name || char.role || 'unnamed'
          removedDuplicates.push(identifier)
          console.warn(`[Safety Net] Removed main character from list (DB match): ${identifier}`)
          return false
        }
        return true
      })
    }

    // ADDITIONAL SAFETY NET: Filter by main character name
    if (mainCharNameForFiltering) {
      const mainNameLower = mainCharNameForFiltering.toLowerCase().trim()
      filteredCharacters = filteredCharacters.filter((char: any) => {
        const charName = char.name?.toLowerCase().trim() || ''
        const charRole = char.role?.toLowerCase().trim() || ''
        
        // Exact match on name
        if (charName && charName === mainNameLower) {
          removedDuplicates.push(char.name || char.role || 'unnamed')
          console.warn(`[Safety Net] Removed main character (exact name match): ${char.name}`)
          return false
        }
        
        // Name contains main name
        if (charName && (charName.includes(mainNameLower) || mainNameLower.includes(charName)) && charName.length > 2) {
          removedDuplicates.push(char.name || char.role || 'unnamed')
          console.warn(`[Safety Net] Removed main character (partial name match): ${char.name}`)
          return false
        }
        
        // Role matches main name
        if (charRole && charRole === mainNameLower) {
          removedDuplicates.push(char.name || char.role || 'unnamed')
          console.warn(`[Safety Net] Removed main character (role match): ${char.role}`)
          return false
        }
        
        return true
      })
    }

    // STEP 8: Update main character's appears_in (assume they appear on all pages)
    let mainCharAppearances: string[] = []
    let mainCharUpdated = false
    
    if (mainCharacter) {
      // Main character typically appears on all or most pages
      const allPageNumbers = pages.map((p: any) => p.page_number.toString())
      mainCharAppearances = allPageNumbers
      
      await supabase
        .from('characters')
        .update({ appears_in: allPageNumbers })
        .eq('id', mainCharacter.id)

      mainCharUpdated = true
      console.log(`[Character ID] Updated main character "${mainCharacter.name}" - appears on all ${allPageNumbers.length} pages`)
    }

    // STEP 9: Filter characters (plural check + existing character check)
    const { data: existingCharacters } = await supabase
      .from('characters')
      .select('name, role, is_main')
      .eq('project_id', project_id)

    // Create sets for quick lookup
    const existingNames = new Set<string>()
    const existingRoles = new Set<string>()
    existingCharacters?.forEach((c: any) => {
      const nameKey = c.name?.toLowerCase().trim()
      const roleKey = c.role?.toLowerCase().trim()
      if (nameKey) existingNames.add(nameKey)
      if (roleKey) existingRoles.add(roleKey)
    })

    // Filter characters
    const beforeFilterCount = filteredCharacters.length
    const newCharacters = filteredCharacters.filter((char: any) => {
      const charName = char.name?.toLowerCase().trim() || null
      const charRole = char.role?.toLowerCase().trim() || null

      // Skip if no identifier
      if (!charName && !charRole) {
        return false
      }

      // Skip if name already exists
      if (charName && existingNames.has(charName)) {
        return false
      }

      // Skip if role already exists (but allow generic roles like "Mom", "Dad")
      if (charRole && existingRoles.has(charRole) && charRole !== 'mom' && charRole !== 'dad') {
        return false
      }

      // Filter out plural characters
      if (isPluralCharacter(char.name || char.role)) {
        return false
      }

      return true
    })

    // STEP 10: LOGGING - Comprehensive logging for monitoring
    console.log('[Character ID] ===== CHARACTER IDENTIFICATION SUMMARY =====')
    console.log(`[Character ID] Project ID: ${project_id}`)
    console.log(`[Character ID] Total Pages: ${maxPageNumber}`)
    console.log(`[Character ID] Main Character: ${mainCharacter?.name || 'Not set'}`)
    console.log(`[Character ID] AI Response - Characters Identified: ${identified.characters.length}`)
    console.log(`[Character ID] Safety Net - Main Character Removed: ${removedDuplicates.length} (${removedDuplicates.join(', ') || 'none'})`)
    console.log(`[Character ID] After Safety Net: ${beforeFilterCount} characters`)
    console.log(`[Character ID] After Filtering - New Characters to Create: ${newCharacters.length}`)
    console.log(`[Character ID] Filtered Out: ${beforeFilterCount - newCharacters.length} characters`)
    console.log('[Character ID] ============================================')

    // STEP 11: Create secondary character records
    let charactersCreated = 0
    if (newCharacters.length > 0) {
      const charactersToCreate = newCharacters.map((char: any) => {
        // Validate and sanitize page numbers
        const validAppearances = (char.appears_in || [])
          .map((p: number) => {
            const pageNum = parseInt(String(p))
            return isNaN(pageNum) || pageNum < 1 || pageNum > maxPageNumber ? null : pageNum.toString()
          })
          .filter((p: string | null): p is string => p !== null)

        return {
          project_id,
          name: char.name || null,
          role: char.role || null,
          appears_in: validAppearances,
          story_role: char.story_role || null,
          is_main: false,
        }
      })

      const { error: createError } = await supabase
        .from('characters')
        .insert(charactersToCreate)

      if (createError) {
        console.error('[Character ID] Error creating characters:', createError)
        return NextResponse.json(
          { error: 'Failed to create character records', details: createError.message },
          { status: 500 }
        )
      }
      charactersCreated = charactersToCreate.length
    }

    // STEP 12: Update pages with character_ids
    // Get all characters (including newly created ones) WITH appears_in
    const { data: allCharacters } = await supabase
      .from('characters')
      .select('id, name, role, appears_in')
      .eq('project_id', project_id)

    // Create character map for lookup and track appears_in per character ID
    const characterMap = new Map<string, string>()
    const characterAppearancesMap = new Map<string, string[]>()

    allCharacters?.forEach((c: any) => {
      const nameKey = c.name?.toLowerCase().trim()
      const roleKey = c.role?.toLowerCase().trim()
      if (nameKey) {
        characterMap.set(nameKey, c.id)
        characterAppearancesMap.set(c.id, c.appears_in || [])
      }
      if (roleKey) {
        characterMap.set(roleKey, c.id)
        characterAppearancesMap.set(c.id, c.appears_in || [])
      }
    })

    // Update each page with character_ids
    const pageUpdates = pages.map((page: any) => {
      const characterIds: string[] = []
      const pageNumberStr = page.page_number.toString()

      // Add main character if they appear on this page
      if (mainCharacter && mainCharAppearances.includes(pageNumberStr)) {
        characterIds.push(mainCharacter.id)
      }

      // Add secondary characters that appear on this page
      // Use validated appears_in from database (not AI response)
      allCharacters?.forEach((char: any) => {
        // Skip main character (already added above)
        if (char.id === mainCharacter?.id) return

        // Skip if already in list
        if (characterIds.includes(char.id)) return

        // Check if character appears on this page using validated appears_in from DB
        const charAppearances = characterAppearancesMap.get(char.id) || []
        if (charAppearances.includes(pageNumberStr)) {
          characterIds.push(char.id)
        }
      })

      return { id: page.id, character_ids: characterIds }
    })

    // Batch update pages
    for (const update of pageUpdates) {
      await supabase
        .from('pages')
        .update({ character_ids: update.character_ids })
        .eq('id', update.id)
    }

    // STEP 13: Update project status
    await supabase
      .from('projects')
      .update({ status: 'character_review' })
      .eq('id', project_id)

    return {
      success: true,
      main_character: mainCharacter?.name || null,
      main_character_updated: mainCharUpdated,
      characters_identified: identified.characters.length,
      safety_net_removed: removedDuplicates.length,
      safety_net_removed_list: removedDuplicates,
      characters_after_safety_net: beforeFilterCount,
      characters_created: charactersCreated,
      filtered_out: beforeFilterCount - newCharacters.length,
      characters: newCharacters,
    }
}

export async function POST(request: NextRequest) {
  try {
    const { project_id } = await request.json()

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    const result = await identifyCharactersForProject(project_id)
    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[Character ID] Error identifying characters:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to identify characters' },
      { status: 500 }
    )
  }
}
