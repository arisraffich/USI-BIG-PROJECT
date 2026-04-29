import { OpenAI } from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { DirectorSchema, zodToResponsesFormat, extractResponseContent, actionsArrayToObject } from '@/lib/ai/schemas'

interface DirectorCharacter {
    name?: string | null
    description?: string | null
    appearance_notes?: string | null
}


export async function analyzeScene(
    projectId: string,
    pageId: string,
    storyText: string,
    sceneDescription: string,
    characters: DirectorCharacter[]
) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })

    try {
        const supabase = await createAdminClient()

        console.log(`AI Director: Analyzing Page ${pageId}...`)

        const characterContext = characters.map(c =>
            `${c.name}: ${c.description} (Appearance: ${c.appearance_notes || 'N/A'})`
        ).join('\n')

        const prompt = `You are the "AI Director" for a children's book.
Analyze the following scene and determine the actions and positioning for each character present.
Also write a detailed visual description (illustration prompt) for the scene.

Characters available:
${characterContext}

Story Text for this Page:
"${storyText}"

Scene Description:
"${sceneDescription}"

Return character_actions as an array of objects with "character_name" and "action" fields.
Only include characters that should be visible in the scene.`

        const completion = await openai.responses.create({
            model: "gpt-5.4",
            input: prompt,
            text: {
                format: zodToResponsesFormat(DirectorSchema, 'director_analysis')
            },
            reasoning: {
                effort: "medium"
            }
        })

        const { text: content, refusal } = extractResponseContent(completion)
        if (refusal) throw new Error(`Model refused: ${refusal}`)
        if (!content) throw new Error('No content from OpenAI')

        const parsed = JSON.parse(content)
        const result = {
            character_actions: actionsArrayToObject(parsed.character_actions),
            illustration_prompt: parsed.illustration_prompt,
        }

        const { error } = await supabase
            .from('pages')
            .update({
                character_actions: result.character_actions,
                illustration_prompt: result.illustration_prompt,
                illustration_status: 'analyzed',
                updated_at: new Date().toISOString()
            })
            .eq('id', pageId)

        if (error) throw error

        console.log('AI Director: Analysis Complete & Saved.')
        return result

    } catch (error) {
        console.error('AI Director Error:', error)
        // We do not throw here to avoid crashing the configure saving process,
        // but checking status will fail/timeout.
        throw error
    }
}
