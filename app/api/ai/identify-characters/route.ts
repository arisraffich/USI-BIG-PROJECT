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

export async function POST(request: NextRequest) {
  try {
    const { project_id } = await request.json()

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Get all pages for this project
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

    // Build full story text
    const fullStory = pages
      .map((p) => `Page ${p.page_number}: ${p.story_text}`)
      .join('\n\n')

    const prompt = `You are analyzing a children's book story to identify important characters that need to be illustrated.

STORY:
${fullStory}

TASK:
Identify all characters (human, animal, or object) that are important to the story and should be illustrated.

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

4. NAMED VS UNNAMED:
   - If a character has a name (even if mentioned once), include it
   - If a character is referred to by a singular role/title consistently, include it
   - If a character is part of a group but has a specific name, include ONLY the named individual, not the group

5. ROLE-BASED CHARACTERS:
   - Singular roles are OK: "Mom", "Dad", "Teacher", "Doctor" (if it's THE specific mom/dad/teacher/doctor)
   - Plural roles are NOT OK: "Moms", "Teachers", "Doctors" (if referring to multiple)
   - If text says "the teacher" (singular, specific) → include
   - If text says "the teachers" (plural) → exclude

6. ANIMALS AND OBJECTS:
   - Include if singular and specific: "the dog", "Rex", "Blue Truck"
   - Exclude if plural or generic: "dogs", "the animals", "trucks"
   - Include personified objects only if they are singular and play a meaningful role

7. VALIDATION CHECK - WRITER INTENT & CHARACTER FORM NECESSITY:

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
      
   REMEMBER: We're identifying characters so writers can fill out character forms.
   Only include characters where the form-filling effort is justified by the character's importance.

NOTE: After identification, plural characters will be filtered out programmatically as a safety measure.

For each character, provide:
1. Name (if they have one) OR Role (if singular and specific, e.g., "Mom", "the Dog", "Blue Truck")
2. All page numbers where they appear (list all)
3. Brief story role (1 sentence describing their significance)

Respond in JSON format:
{
  "characters": [
    {
      "name": "Character name or null",
      "role": "Role if no name (e.g., Mom, the Dog, Blue Truck)",
      "appears_in": [5, 8, 12, 19],
      "story_role": "Brief description of significance"
    }
  ]
}`

    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      )
    }

    let completion
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-5.1', // Updated to GPT-5.1 with medium reasoning
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        reasoning_effort: 'medium', // Medium reasoning for better character identification
        // Note: temperature is not supported with reasoning_effort other than 'none'
      })
    } catch (error: any) {
      console.error('OpenAI API Error in identify-characters:', error.message)
      throw error
    }

    const identified = JSON.parse(
      completion.choices[0].message.content || '{"characters": []}'
    )

    if (!identified.characters || !Array.isArray(identified.characters)) {
      return NextResponse.json(
        { error: 'Invalid response format from AI' },
        { status: 500 }
      )
    }

    // Get existing characters (including main character) to avoid duplicates
    const { data: existingCharacters } = await supabase
      .from('characters')
      .select('name, role, is_main')
      .eq('project_id', project_id)

    // Find the main character
    const mainCharacter = existingCharacters?.find((c) => c.is_main)
    const mainCharName = mainCharacter?.name?.toLowerCase().trim() || null

    // Create sets of existing character identifiers for quick lookup
    const existingNames = new Set<string>()
    const existingRoles = new Set<string>()
    existingCharacters?.forEach((c) => {
      const nameKey = c.name?.toLowerCase().trim()
      const roleKey = c.role?.toLowerCase().trim()
      if (nameKey) existingNames.add(nameKey)
      if (roleKey) existingRoles.add(roleKey)
    })

    // HYBRID FILTER: Filter out main character, existing characters, AND plural characters
    const newCharacters = identified.characters.filter((char: any) => {
      const charName = char.name?.toLowerCase().trim() || null
      const charRole = char.role?.toLowerCase().trim() || null
      
      // Skip if no identifier
      if (!charName && !charRole) {
        return false
      }
      
      // CRITICAL: Skip if this character's name matches the main character's name
      // This prevents "Zara" from being added as a new character when main character is already "Zara"
      if (mainCharName && charName && charName === mainCharName) {
        return false
      }
      
      // Skip if name already exists in any character
      if (charName && existingNames.has(charName)) {
        return false
      }
      
      // Skip if role already exists (but allow if it's a generic role like "Mom")
      // Only skip if it's a specific role that already exists
      if (charRole && existingRoles.has(charRole) && charRole !== 'mom' && charRole !== 'dad') {
        return false
      }
      
      // HYBRID FILTER: Check if character name/role is plural
      if (isPluralCharacter(char.name || char.role)) {
        return false
      }
      
      return true
    })

    // Create character records for new characters only
    const charactersToCreate = newCharacters.map((char: any) => ({
      project_id,
      name: char.name || null,
      role: char.role || null,
      appears_in: char.appears_in || [],
      story_role: char.story_role || null,
      is_main: false,
    }))

    if (charactersToCreate.length > 0) {
      const { error: createError } = await supabase
        .from('characters')
        .insert(charactersToCreate)

      if (createError) {
        console.error('Error creating characters:', createError)
        return NextResponse.json(
          { error: 'Failed to create character records' },
          { status: 500 }
        )
      }
    }

    // Get all characters for this project (including newly created ones)
    const { data: allCharacters } = await supabase
      .from('characters')
      .select('id, name, role')
      .eq('project_id', project_id)

    // Create a map of character name/role to ID for fast lookup (case-insensitive)
    const characterMap = new Map<string, string>()
    allCharacters?.forEach((c) => {
      const key = (c.name || c.role || '').toLowerCase().trim()
      if (key) characterMap.set(key, c.id)
    })

    // Update pages with character_ids (use all identified characters, not just new ones)
    const pageUpdates = pages.map((page) => {
      const characterIds = identified.characters
        .filter((char: any) => char.appears_in?.includes(page.page_number))
        .map((char: any) => {
          const key = (char.name || char.role || '').toLowerCase().trim()
          return characterMap.get(key)
        })
        .filter(Boolean) as string[]

      return { id: page.id, character_ids: characterIds }
    })

    // Batch update pages
    for (const update of pageUpdates) {
      await supabase
        .from('pages')
        .update({ character_ids: update.character_ids })
        .eq('id', update.id)
    }

    // Update project status
    await supabase
      .from('projects')
      .update({ status: 'character_review' })
      .eq('id', project_id)
    return NextResponse.json({
      success: true,
      count: newCharacters.length,
      total_identified: identified.characters.length,
      characters_created: newCharacters.length,
      characters: newCharacters,
    })
  } catch (error: any) {
    console.error('Error identifying characters:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to identify characters' },
      { status: 500 }
    )
  }
}

