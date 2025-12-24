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
      .select('id, name, role, story_role, biography, age, gender, is_main')
      .eq('project_id', project_id)
      .eq('is_main', true)
      .maybeSingle()
    
    if (mainCharError) {
      console.warn(`[Character ID] Warning: Could not fetch main character: ${mainCharError.message}`)
    }
    
    console.log(`[Character ID] Main character query result: ${mainCharacter ? `Found (id: ${mainCharacter.id})` : 'Not found'}`)

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
    // Main character exists but may not have a name yet (will be extracted from story)
    const mainCharContext = mainCharacter ? `
CRITICAL: MAIN CHARACTER IDENTIFICATION
A main character has been designated for this story (their image has been uploaded).
${mainCharacter.name ? `The main character's name is: "${mainCharacter.name}"` : `The main character's name needs to be EXTRACTED from the story text.`}

YOUR TASK HAS TWO PARTS:

PART 1: IDENTIFY AND TRACK THE MAIN CHARACTER
- Identify WHO the main character/protagonist is in the story
- EXTRACT their name from the story text (this is CRITICAL)
- The main character is typically:
  * The character who appears most frequently
  * The protagonist or central figure of the story
  * The character the story revolves around
- Track which pages they appear on
- Return the main character's NAME and page appearances

PART 2: IDENTIFY SECONDARY CHARACTERS ONLY
- Find all OTHER characters (excluding the main character)
- DO NOT include the main character in secondary_characters
- Only include characters that are DIFFERENT from the main character

IMPORTANT:
- You MUST extract the main character's name from the story
- If the character has a proper name (e.g., "Zara", "Tactile Tabby"), use that
- If the character is referred to by a descriptive title (e.g., "the little bear", "the brave knight"), use that as the name
- The name field is REQUIRED - every story has a way of referring to its main character` : ''

    const prompt = `You are analyzing a children's book story to identify characters that need to be illustrated.
${mainCharContext}

STORY:
${fullStory}

CRITICAL RULES - CHARACTER IDENTIFICATION:

1. MAIN CHARACTER NAME EXTRACTION (MOST IMPORTANT):
   - You MUST identify and extract the main character's name from the story
   - Look for the protagonist - the character the story is about
   - Use their proper name if they have one (e.g., "Zara", "Max", "Tactile Tabby")
   - If no proper name, use their most common reference (e.g., "the little girl", "the brave bear")

2. SINGULAR CHARACTERS ONLY:
   - ONLY identify individual, singular characters
   - Each character must be a specific, identifiable individual
   - Characters must be able to be illustrated as a single entity

3. EXCLUDE PLURAL/GROUP REFERENCES:
   - DO NOT identify plural nouns (words ending in -s, -es, or indicating multiple entities)
   - DO NOT identify collective groups (e.g., groups of people, animals, or objects)
   - DO NOT identify generic categories or types
   - If a reference describes multiple entities, exclude it

4. INCLUDE SPECIFIC INDIVIDUALS:
   - Include characters with proper names (first names, full names, or specific titles with names)
   - Include singular role-based characters that represent ONE specific person/animal/object (e.g., "Mom", "Dad", "the dog", "Grandma")
   - Include personified objects that are singular and specific (e.g., "Blue Truck", "Magic Wand")
   - If a character appears multiple times and is clearly the same individual, include it

5. VALIDATION CHECK - WRITER INTENT & CHARACTER FORM NECESSITY:

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
    "name": "EXTRACTED NAME FROM STORY (REQUIRED - e.g., 'Zara', 'Tactile Tabby', 'the little bear')",
    "appears_in": [1, 2, 3, 5, 8],
    "story_role": "Brief description of who they are in the story"
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
- "main_character.name" is REQUIRED - extract from story text
- "main_character.appears_in" must include all pages where the main character appears
- "secondary_characters" should ONLY contain characters that are NOT the main character
- Each secondary character must have either a "name" OR a "role" (or both)
- "appears_in" must be an array of page numbers (integers between 1 and ${maxPageNumber})
- Filter out plural characters programmatically (they will be filtered again as a safety measure)`

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
          effort: 'low' // Character identification needs some reasoning but not deep analysis
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

    // STEP 7: Update main character's name and appears_in
    let mainCharAppearances: string[] = []
    let mainCharUpdated = false
    let extractedMainCharName: string | null = null

    // Extract main character name from AI response first (we need this regardless)
    extractedMainCharName = identified.main_character?.name || null
    
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
          // Build update object - always update appears_in and story_role
          const updateData: any = {
            appears_in: mainCharAppearances,
            story_role: identified.main_character.story_role || mainCharacter.story_role || mainCharacter.biography
          }
          
          // Update name if it was extracted and main character doesn't have one yet
          if (extractedMainCharName && !mainCharacter.name) {
            updateData.name = extractedMainCharName
            console.log(`[Character ID] ✅ Extracted main character name from story: "${extractedMainCharName}"`)
          } else if (extractedMainCharName && mainCharacter.name) {
            console.log(`[Character ID] Main character already has name "${mainCharacter.name}", keeping it (AI found: "${extractedMainCharName}")`)
          }

          await supabase
            .from('characters')
            .update(updateData)
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
        
        // Still try to extract name even in fallback
        const fallbackUpdateData: any = { appears_in: allPageNumbers }
        if (identified.main_character?.name && !mainCharacter.name) {
          fallbackUpdateData.name = identified.main_character.name
          extractedMainCharName = identified.main_character.name
          console.log(`[Character ID] ✅ Extracted main character name (fallback): "${extractedMainCharName}"`)
        }
        
        await supabase
          .from('characters')
          .update(fallbackUpdateData)
          .eq('id', mainCharacter.id)

        mainCharAppearances = allPageNumbers
        mainCharUpdated = true
      }
    } else {
      // FALLBACK: Main character not found in initial query, but we can still update by project_id
      // This handles race conditions where the main character was just created
      if (extractedMainCharName || identified.main_character?.appears_in) {
        console.log('[Character ID] ⚠️ Main character not found in initial query, attempting update by project_id...')
        
        const allPageNumbers = pages.map((p: any) => p.page_number.toString())
        mainCharAppearances = identified.main_character?.appears_in?.map((p: number) => {
          const pageNum = parseInt(String(p))
          return isNaN(pageNum) || pageNum < 1 || pageNum > maxPageNumber ? null : pageNum.toString()
        }).filter((p: string | null): p is string => p !== null) || allPageNumbers
        
        const updateData: any = {
          appears_in: mainCharAppearances.length > 0 ? mainCharAppearances : allPageNumbers,
          story_role: identified.main_character?.story_role || null
        }
        
        if (extractedMainCharName) {
          updateData.name = extractedMainCharName
          console.log(`[Character ID] ✅ Updating main character name by project_id: "${extractedMainCharName}"`)
        }
        
        const { error: updateError } = await supabase
          .from('characters')
          .update(updateData)
          .eq('project_id', project_id)
          .eq('is_main', true)
        
        if (updateError) {
          console.error(`[Character ID] Failed to update main character by project_id: ${updateError.message}`)
        } else {
          mainCharUpdated = true
          console.log(`[Character ID] ✅ Main character updated via project_id fallback`)
        }
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
      console.log(`[Character ID] Main Character Name (before): ${mainCharacter.name || 'NULL'}`)
      console.log(`[Character ID] Main Character Name (extracted): ${extractedMainCharName || 'Not extracted'}`)
      console.log(`[Character ID] Main Character Name Updated: ${!mainCharacter.name && !!extractedMainCharName ? 'YES' : 'NO'}`)
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
      main_character_name_extracted: extractedMainCharName,
      main_character_name_was_updated: !mainCharacter?.name && !!extractedMainCharName,
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
