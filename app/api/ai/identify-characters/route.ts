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
    const { data: mainCharacter } = await supabase
      .from('characters')
      .select('id, name, role, story_role, biography, age, gender, is_main')
      .eq('project_id', project_id)
      .eq('is_main', true)
      .single()

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

    // STEP 3: Build enhanced prompt with main character context
    const mainCharContext = mainCharacter ? `
CRITICAL: MAIN CHARACTER INFORMATION
The main character for this story has already been created from a character form. You must recognize this character in the story and handle it separately.

MAIN CHARACTER DETAILS:
- Name: ${mainCharacter.name || 'Not specified in form (may be referred to by role in story)'}
- Role/Description: ${mainCharacter.story_role || mainCharacter.biography || 'Main character'}
- Age: ${mainCharacter.age || 'Not specified'}
- Gender: ${mainCharacter.gender || 'Not specified'}

YOUR TASK HAS TWO PARTS:

PART 1: TRACK MAIN CHARACTER APPEARANCES
- Identify which pages the main character appears on
- The main character may be referred to by:
  * Their exact name: "${mainCharacter.name}"
  * Name variations: nicknames, titles, or descriptive phrases (e.g., "Zara" might be called "Zara the Explorer", "Little Zara", "our hero")
  * Role-based references: "the girl", "the boy", "Mom", "Dad", "the hero", "the main character", etc.
  * If a character appears frequently throughout the story and matches the main character's description, it's likely the same person
- Return the main character's page appearances in the "main_character.appears_in" field
- If the main character appears on most or all pages, include all relevant page numbers

PART 2: IDENTIFY SECONDARY CHARACTERS ONLY
- Find all OTHER characters (excluding the main character)
- DO NOT create a duplicate entry for the main character
- If you identify a character that matches the main character (by name, role, or description), DO NOT include it in secondary_characters
- Only include characters that are DIFFERENT from the main character

IMPORTANT RULES FOR MAIN CHARACTER RECOGNITION:
1. If the main character has a name and you see that name (or variations) in the story → it's the main character
2. If the main character has no name but has a role/description, match by role/description
3. If a character appears on many pages and matches the main character's description → it's likely the main character
4. When in doubt, exclude the character from secondary_characters (better to miss a secondary than duplicate the main)` : ''

    const prompt = `You are analyzing a children's book story to identify characters that need to be illustrated.
${mainCharContext}

STORY:
${fullStory}

CRITICAL RULES - CHARACTER IDENTIFICATION:

1. SINGULAR CHARACTERS ONLY:
   - ONLY identify individual, singular characters
   - Each character must be a specific, identifiable individual
   - Characters must be able to be illustrated as a single entity

2. EXCLUDE PLURAL/GROUP REFERENCES:
   - DO NOT identify plural nouns (words ending in -s, -es, or indicating multiple entities)
   - DO NOT identify collective groups (e.g., groups of people, animals, or objects)
   - DO NOT identify generic categories or types
   - If a reference describes multiple entities, exclude it

3. INCLUDE SPECIFIC INDIVIDUALS:
   - Include characters with proper names (first names, full names, or specific titles with names)
   - Include singular role-based characters that represent ONE specific person/animal/object (e.g., "Mom", "Dad", "the dog", "Grandma")
   - Include personified objects that are singular and specific (e.g., "Blue Truck", "Magic Wand")
   - If a character appears multiple times and is clearly the same individual, include it

4. VALIDATION CHECK - WRITER INTENT & CHARACTER FORM NECESSITY:

   The ultimate question: "Would the writer want to fill out a character form for this character?"
   
   This means asking:
   
   a) Is this character important enough that the writer cares about their appearance?
      - Recurring characters (appear multiple times) → likely YES
      - Characters with dialogue or direct interaction → likely YES
      - Named characters → likely YES
      - Characters central to plot or emotional moments → likely YES
      
   b) Or is this character just background/environmental?
      - Appears once briefly → likely NO
      - Part of crowd/scene setting → likely NO
      - Mentioned in passing without interaction → likely NO
      - Generic placeholder ("people", "children", "neighbors") → NO
      
   c) Would a generic illustration suffice, or does this need specific design?
      - Generic illustration sufficient → EXCLUDE
      - Needs specific appearance details → INCLUDE
      
   d) If this character were removed, would the story change meaningfully?
      - Story would be different → INCLUDE
      - Story would be essentially the same → EXCLUDE

RESPONSE FORMAT:
You must return a JSON object with this exact structure:
{
  "main_character": {
    "name": "${mainCharacter?.name || 'Main Character'}",
    "appears_in": [1, 2, 3, 5, 8]
  },
  "secondary_characters": [
    {
      "name": "Character name or null",
      "role": "Role if no name (e.g., Mom, the Dog, Blue Truck)",
      "appears_in": [5, 8, 12, 19],
      "story_role": "Brief description of significance"
    }
  ]
}

IMPORTANT:
- If main character exists, you MUST include their page appearances in "main_character.appears_in"
- "secondary_characters" should ONLY contain characters that are NOT the main character
- Each secondary character must have either a "name" OR a "role" (or both)
- "appears_in" must be an array of page numbers (integers between 1 and ${maxPageNumber})
- Filter out plural characters programmatically (they will be filtered again as a safety measure)`

    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      )
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
          effort: 'low' // Character identification needs some reasoning but not deep analysis
        }
      })
    } catch (error: any) {
      const errorMessage = error.message || String(error)
      console.error('OpenAI API Error in identify-characters:', errorMessage)
      console.error('Full API Error:', error)
      throw new Error(`Failed to identify characters with GPT-5.2: ${errorMessage}`)
    }

    const firstOutput = completion.output?.[0]
    let responseContent = '{}'
    if (firstOutput && 'content' in firstOutput) {
      const firstContent = firstOutput.content?.[0]
      responseContent = (firstContent && 'text' in firstContent ? firstContent.text : null) || '{}'
    }
    console.log('[Character ID] Raw AI response length:', responseContent.length)
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
    if (!identified.secondary_characters || !Array.isArray(identified.secondary_characters)) {
      console.error('[Character ID] Invalid response structure - missing secondary_characters')
      throw new Error('Invalid response format from AI - missing secondary_characters array')
    }

    // Validate main_character structure if main character exists
    if (mainCharacter && (!identified.main_character || !Array.isArray(identified.main_character?.appears_in))) {
      console.warn('[Character ID] Main character exists but AI did not return main_character.appears_in')
      // We'll handle this in fallback logic below
    }

    // STEP 6: SAFETY NET - Remove main character duplicates from secondary_characters
    let filteredSecondary = identified.secondary_characters
    const removedDuplicates: string[] = []

    if (mainCharacter) {
      filteredSecondary = identified.secondary_characters.filter((char: any) => {
        if (isLikelyMainCharacter(char, mainCharacter)) {
          const identifier = char.name || char.role || 'unnamed'
          removedDuplicates.push(identifier)
          console.warn(`[Safety Net] Removed main character duplicate from secondary: ${identifier}`)
          return false
        }
        return true
      })
    }

    // STEP 7: Update main character's appears_in (if main character exists)
    let mainCharAppearances: string[] = []
    let mainCharUpdated = false

    if (mainCharacter) {
      if (identified.main_character?.appears_in && Array.isArray(identified.main_character.appears_in)) {
        // Validate and sanitize page numbers
        mainCharAppearances = identified.main_character.appears_in
          .map((p: number) => {
            const pageNum = parseInt(String(p))
            return isNaN(pageNum) || pageNum < 1 || pageNum > maxPageNumber ? null : pageNum.toString()
          })
          .filter((p: string | null): p is string => p !== null)

        if (mainCharAppearances.length > 0) {
          await supabase
            .from('characters')
            .update({
              appears_in: mainCharAppearances,
              // Optionally update story_role if AI provided better description
              story_role: identified.main_character.story_role || mainCharacter.story_role || mainCharacter.biography
            })
            .eq('id', mainCharacter.id)

          mainCharUpdated = true
          console.log(`[Character ID] Updated main character appearances: ${mainCharAppearances.join(', ')}`)
        } else {
          console.warn(`[Character ID] Main character found but no valid page appearances returned`)
        }
      }

      // FALLBACK: If AI didn't return valid appearances, use conservative approach
      if (!mainCharUpdated || mainCharAppearances.length === 0) {
        console.log('[Character ID] Using fallback: assuming main character appears on all pages')
        const allPageNumbers = pages.map((p: any) => p.page_number.toString())
        await supabase
          .from('characters')
          .update({ appears_in: allPageNumbers })
          .eq('id', mainCharacter.id)

        mainCharAppearances = allPageNumbers
        mainCharUpdated = true
      }
    }

    // STEP 8: Filter secondary characters (plural check + existing character check)
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

    // Filter secondary characters
    const beforeFilterCount = filteredSecondary.length
    const newCharacters = filteredSecondary.filter((char: any) => {
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

    // STEP 9: LOGGING - Comprehensive logging for monitoring
    console.log('[Character ID] ===== CHARACTER IDENTIFICATION SUMMARY =====')
    console.log(`[Character ID] Project ID: ${project_id}`)
    console.log(`[Character ID] Total Pages: ${maxPageNumber}`)
    console.log(`[Character ID] Main Character Exists: ${!!mainCharacter}`)
    if (mainCharacter) {
      console.log(`[Character ID] Main Character Name: ${mainCharacter.name || 'Unnamed'}`)
      console.log(`[Character ID] Main Character Appearances: ${mainCharAppearances.length} pages`)
    }
    console.log(`[Character ID] AI Response - Secondary Characters Identified: ${identified.secondary_characters.length}`)
    console.log(`[Character ID] Safety Net - Main Character Duplicates Removed: ${removedDuplicates.length} (${removedDuplicates.join(', ')})`)
    console.log(`[Character ID] After Safety Net - Secondary Characters: ${beforeFilterCount}`)
    console.log(`[Character ID] After Filtering - New Characters to Create: ${newCharacters.length}`)
    console.log(`[Character ID] Filtered Out: ${beforeFilterCount - newCharacters.length} characters`)
    console.log('[Character ID] ============================================')

    // STEP 10: Create secondary character records
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

    // STEP 11: Update pages with character_ids
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

    // STEP 12: Update project status
    await supabase
      .from('projects')
      .update({ status: 'character_review' })
      .eq('id', project_id)

    return {
      success: true,
      main_character_updated: mainCharUpdated,
      main_character_appearances: mainCharAppearances.length,
      main_character_appearances_list: mainCharAppearances,
      secondary_characters_identified: identified.secondary_characters.length,
      safety_net_removed: removedDuplicates.length,
      safety_net_removed_list: removedDuplicates,
      secondary_characters_after_safety_net: beforeFilterCount,
      secondary_characters_created: charactersCreated,
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
