
import { OpenAI } from 'openai'
import { createAdminClient } from '@/lib/supabase/server'



export async function analyzeScene(
    projectId: string,
    pageId: string,
    storyText: string,
    sceneDescription: string,
    characters: any[]
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

        const prompt = `
        You are the "AI Director" for a children's book.
        Analyze the following scene and determine the actions and positioning for each character present.
        Also write a detailed visual description (illustration prompt) for the scene.

        Characters available:
        ${characterContext}

        Story Text for this Page:
        "${storyText}"

        Scene Description:
        "${sceneDescription}"

        Response Format (JSON):
        {
            "character_actions": {
                "CharacterName": "Describe specifically what they are doing, wearing, and their emotion."
            },
            "illustration_prompt": "A complete, detailed image generation prompt describing the scene, style, lighting, and composition. Do NOT include technical parameters."
        }
        
        Only include characters that should be visible in the scene.
        `

        const completion = await openai.responses.create({
            model: "gpt-5.2",
            input: `You are a helpful AI Director outputting valid JSON.\n\n${prompt}`,
            text: {
                format: { type: "json_object" }
            },
            reasoning: {
                effort: "medium" // Complex multi-character coordination and spatial reasoning
            }
        })

        // Find the message output (not reasoning)
        const messageOutput = completion.output?.find((o: any) => o.type === 'message')
        let content = null
        if (messageOutput && 'content' in messageOutput) {
            const firstContent = messageOutput.content?.[0]
            content = firstContent && 'text' in firstContent ? firstContent.text : null
        }
        if (!content) throw new Error('No content from OpenAI')

        const result = JSON.parse(content)

        // Update Database
        const { error } = await supabase
            .from('pages')
            .update({
                character_actions: result.character_actions,
                illustration_prompt: result.illustration_prompt,
                illustration_status: 'analyzed', // Custom status to signal readiness
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
