import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { openai } from '@/lib/ai/openai'
import { getErrorMessage } from '@/lib/utils/error'

export const maxDuration = 30

export async function POST(request: NextRequest) {
    try {
        const { project_id } = await request.json()

        if (!project_id) {
            return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        const { data: pages, error: pagesError } = await supabase
            .from('pages')
            .select('page_number, story_text, scene_description')
            .eq('project_id', project_id)
            .order('page_number', { ascending: true })

        if (pagesError || !pages || pages.length === 0) {
            return NextResponse.json({ suggestions: [] })
        }

        const { data: existingCharacters } = await supabase
            .from('characters')
            .select('name, role, is_main')
            .eq('project_id', project_id)

        const mainChar = existingCharacters?.find((c: any) => c.is_main)
        const mainCharName = mainChar?.name || null

        const existingNames = new Set<string>()
        const existingRoles = new Set<string>()
        existingCharacters?.forEach((c: any) => {
            if (c.name) existingNames.add(c.name.toLowerCase().trim())
            if (c.role) existingRoles.add(c.role.toLowerCase().trim())
        })

        const maxPageNumber = pages.length
        const fullStory = pages
            .map((p: any) => {
                let text = `Page ${p.page_number}: ${p.story_text}`
                if (p.scene_description) text += `\n  [Scene: ${p.scene_description}]`
                return text
            })
            .join('\n\n')

        const existingList = existingCharacters
            ?.map((c: any) => `- ${c.name || c.role}${c.is_main ? ' (MAIN)' : ''}`)
            .join('\n') || 'None'

        const prompt = `You are an expert children's book story analyst.

Given the story and scene descriptions below, plus the list of EXISTING characters already in the system, identify any MISSING secondary characters that should be added.

${mainCharName ? `MAIN CHARACTER (already exists — DO NOT include): "${mainCharName}"
IMPORTANT: The main character "${mainCharName}" may be referred to by aliases, nicknames, pronouns, or generic labels like "the kid", "the boy", "the girl", "the child", "he", "she", etc. Do NOT suggest the main character under ANY name or description.` : ''}

EXISTING CHARACTERS (already in the system — DO NOT include any of these or their aliases):
${existingList}

STORY WITH SCENE DESCRIPTIONS:
${fullStory}

────────────────
RULES

Return ONLY characters that:
1. Are genuinely DIFFERENT individuals from ALL existing characters listed above
2. Appear visually on-page in at least one scene (check scene descriptions)
3. Are individual beings (not groups/crowds)
4. Have narrative importance (dialogue, drives plot, interacts with main character)
5. Would need a unique visual design for illustration

EXCLUDE:
- The main character under ANY name, alias, pronoun, or description
- Any existing character under any name/alias/variation
- Groups, crowds, background extras
- Off-screen or narration-only mentions
- Objects, places, abstractions

NAMING: Use the most recognizable name from the story or scene descriptions. If unnamed, use a clear role label (e.g., "The Daughter", "The Boy").

────────────────
OUTPUT — STRICT JSON ONLY

{
  "characters": [
    {
      "name": "Best display name",
      "role": "Brief narrative role (1 sentence)",
      "appears_in": [1, 3, 5],
      "story_role": "Brief physical/personality description from story or scene descriptions"
    }
  ]
}

If NO missing characters: {"characters": []}

CONSTRAINTS:
- "appears_in" must be valid page numbers (1 to ${maxPageNumber})
- Fewer correct characters is ALWAYS better than many minor ones
- Do NOT include ANY character that matches an existing name, role, or alias`

        if (!openai) {
            return NextResponse.json({ suggestions: [] })
        }

        const completion = await openai.responses.create({
            model: 'gpt-5.2',
            input: prompt,
            text: { format: { type: 'json_object' } },
            reasoning: { effort: 'medium' }
        })

        const messageOutput = completion.output?.find((o: any) => o.type === 'message')
        let responseContent = '{}'
        if (messageOutput && 'content' in messageOutput) {
            const firstContent = messageOutput.content?.[0]
            responseContent = (firstContent && 'text' in firstContent ? firstContent.text : null) || '{}'
        }

        let parsed
        try {
            parsed = JSON.parse(responseContent)
        } catch {
            return NextResponse.json({ suggestions: [] })
        }

        if (!parsed.characters || !Array.isArray(parsed.characters)) {
            return NextResponse.json({ suggestions: [] })
        }

        const suggestions = parsed.characters
            .filter((char: any) => {
                const name = char.name?.toLowerCase().trim()
                const role = char.role?.toLowerCase().trim()
                if (!name && !role) return false
                if (name && existingNames.has(name)) return false
                if (role && existingRoles.has(role)) return false
                return true
            })
            .map((char: any) => ({
                name: char.name || null,
                role: char.role || null,
                story_role: char.story_role || null,
                appears_in: (char.appears_in || [])
                    .map((p: number) => {
                        const num = parseInt(String(p))
                        return isNaN(num) || num < 1 || num > maxPageNumber ? null : num.toString()
                    })
                    .filter((p: string | null): p is string => p !== null),
            }))

        return NextResponse.json({ suggestions })

    } catch (error: unknown) {
        console.error('[Character Suggest] Error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Failed to suggest characters') },
            { status: 500 }
        )
    }
}
