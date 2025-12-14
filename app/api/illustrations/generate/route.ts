import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateIllustration } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'

// Allow max duration for AI generation
export const maxDuration = 60

// Helper to map UI aspect ratios to Gemini-supported values
function mapAspectRatio(ratio: string | null | undefined): string {
    switch (ratio) {
        case '8:10': return '4:5';
        case '8.5:8.5': return '1:1';
        case '8.5:11': return '3:4'; // Closest match for Letter
        default: return '1:1';
    }
}

export async function POST(request: Request) {
    try {
        const { projectId, pageId, customPrompt, currentImageUrl } = await request.json()

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // 1. Fetch Project Configuration (Always needed for ratio)
        const { data: project } = await supabase
            .from('projects')
            .select('illustration_aspect_ratio, illustration_text_integration, illustration_send_count')
            .eq('id', projectId)
            .single()

        // 3. Fetch Data for the specific Page (Page 1)
        // If pageId is provided use that, otherwise find Page 1
        let pageQuery = supabase.from('pages').select('*').eq('project_id', projectId)

        if (pageId) {
            pageQuery = pageQuery.eq('id', pageId)
        } else {
            pageQuery = pageQuery.eq('page_number', 1)
        }

        const { data: pageData, error: pageError } = await pageQuery.single()

        if (pageError || !pageData) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 })
        }

        const mappedAspectRatio = mapAspectRatio(project?.illustration_aspect_ratio)
        let fullPrompt = ''
        let referenceImages: string[] = []

        // --- EDIT MODE vs STANDARD MODE ---
        if (customPrompt && currentImageUrl) {
            console.log(`Regenerating illustration (Edit Mode) for Page ${pageData.page_number}`)
            // Edit Mode: Use User Prompt + Current Image
            fullPrompt = `EDIT INSTRUCTIONS:
${customPrompt}

ORIGINAL IMAGE CONTEXT:
The attached image is the current illustration. 
Modify it appropriately based on the user's instructions while maintaining the overall style and composition unless asked to change it.`

            referenceImages = [currentImageUrl]
        } else {
            console.log(`Generating illustration (Standard Mode) for Project ${projectId}, Page ${pageData.page_number}`)

            // Standard Mode: Fetch Characters & Build AI Director Prompt
            const { data: characters } = await supabase
                .from('characters')
                .select('id, name, role, image_url')
                .eq('project_id', projectId)
                .not('image_url', 'is', null)

            referenceImages = characters?.map(c => c.image_url).filter(Boolean) as string[] || []

            // Construct Prompt (Existing Logic)
            const characterActions = pageData.character_actions || {}
            let actionDescription = ''

            if (characterActions) {
                Object.values(characterActions).forEach((action: any) => {
                    if (action.action) actionDescription += `Character Action: ${action.action}. `
                    if (action.pose) actionDescription += `Pose: ${action.pose}. `
                    if (action.emotion) actionDescription += `Emotion: ${action.emotion}. `
                })
            }

            const isIntegrated = project?.illustration_text_integration === 'integrated'
            const storyText = pageData.story_text || ''
            let textPromptSection = ''

            // ... (Existing Text Integration Logic) ...
            if (isIntegrated) {
                textPromptSection = `TEXT INTEGRATION & LAYOUT INSTRUCTIONS:

The following story text is provided ONLY to determine layout and spacing.
It must NOT be drawn or rendered inside the illustration.

"${storyText}"

You must plan the illustration composition around this text BEFORE finalizing the scene.

CRITICAL RULE — NO TEXT DRAWING:
Do NOT draw, write, paint, render, or include ANY visible text, letters, words, symbols, handwriting, or placeholder typography inside the illustration.
The illustration must contain ZERO visible text of any kind.
Your responsibility is layout planning only.

IMPORTANT:
You are NOT responsible for final typography.
Your task is to CREATE appropriate text-safe areas or text containers that will later receive the final text rendered by the application.

TEXT PLANNING RULES:
- Analyze the length, structure, and paragraph count of the provided story text.
- Based on the text length, intentionally reserve sufficient visual space for the text.
- For short text, reserve one calm text area.
- For long or multi-paragraph text, reserve larger areas, typically at the TOP and/or BOTTOM of the illustration.
- If the text contains multiple paragraphs, you may split the layout into multiple text-safe areas.

TEXT AREA DESIGN:
- Use harmonious visual solutions appropriate to the illustration style (soft background washes, framed negative space, sky, walls, floor, or other calm zones).
- Text-safe areas must NOT resemble signs, banners, labels, or UI elements.
- Do NOT use speech bubbles, thought bubbles, captions, or dialogue containers.
- Text areas must feel intentionally designed as part of the composition, not overlaid.

EDGE SAFETY & MARGINS (STRICT):
- Text-safe areas must NEVER touch or intersect the edges of the illustration.
- Always maintain a clear inner margin between the text-safe area and all illustration borders.
- The text-safe area must appear comfortably inset, with visible breathing space from the page edges.

SAFETY & READABILITY RULES (STRICT):
- NEVER place text-safe areas over characters.
- NEVER cover faces, eyes, hands, or emotional focal points.
- NEVER place text-safe areas on busy or highly textured backgrounds.
- ALWAYS ensure sufficient contrast for future readability.

FINAL REQUIREMENT:
The illustration must look intentionally composed to include text, following professional children’s book layout standards, while containing NO drawn text at all.

FAILSAFE RULE:
If there is any conflict between illustration detail and text readability, text readability takes priority over background decoration.`
            } else {
                textPromptSection = `STORY CONTEXT (FOR SCENE MOOD ONLY):
"${storyText}"

IMPORTANT: Do NOT render any text in the illustration. The story text will be printed on a separate page.`
            }

            fullPrompt = `Scene Description:
${pageData.scene_description || 'A scene from the story.'}

Character Instructions:
${actionDescription || 'No specific character actions.'}

Background Instructions:
${pageData.background_elements || 'Appropriate background for the scene.'}

STYLE & TECHNIQUE INSTRUCTIONS:
Use ALL attached character images as REFERENCES.

1. CHARACTER IDENTITY (CRITICAL - PRIORITY #1):
   - All characters in the illustration must LOOK EXACTLY like the characters in the reference images.
   - Maintain strict consistency in their: hair color, hairstyle, facial features, proportions, clothing, accessories (glasses/hats), and distinctive design elements.
   - Do NOT alter or reinterpret their physical appearance.
   
2. SCENE INTEGRATION & ART STYLE (CRITICAL - PRIORITY #2):
   - Perfectly integrate these characters into the new environment.
   - Do NOT just "paste" them in. They must interact with the scene's lighting (shadows, highlights, color temperature) and perspective.
   - Replicate the exact art style and medium of the reference images (e.g., watercolor, pencil, digital paint).
   - Match the line quality, brush strokes, shading technique, and color palette.
   - The final result must be a cohesive, professional children's book illustration where the characters are instantly recognizable but fully immersed in the scene's lighting and mood.

${textPromptSection}`
        }

        console.log(`Generating illustration with Aspect Ratio: ${mappedAspectRatio}`)

        // 5. Generate with Google AI
        const result = await generateIllustration({
            prompt: fullPrompt,
            referenceImages: referenceImages,
            aspectRatio: mappedAspectRatio
        })

        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Failed to generate illustration')
        }

        // 6. Upload to Storage
        const timestamp = Date.now()
        const filename = `${projectId}/illustrations/page-${pageData.page_number}-${timestamp}.png`

        const { error: uploadError } = await supabase.storage
            .from('illustrations') // Ensure this bucket exists or use 'project-assets'
            .upload(filename, result.imageBuffer, {
                contentType: 'image/png',
                upsert: true
            })

        if (uploadError) throw new Error(`Storage Upload Failed: ${uploadError.message}`)

        const { data: urlData } = supabase.storage.from('illustrations').getPublicUrl(filename)
        const publicUrl = urlData.publicUrl

        // 7. Update Page Record
        await supabase.from('pages')
            .update({
                illustration_url: publicUrl,
                is_resolved: true, // Mark any existing feedback as resolved since we generated a new version
            })
            .eq('id', pageData.id)

        // 8. Update Project Status (Enable Resend Flow)
        // Only update status to 'illustration_revision_needed' if we have already sent the trial at least once.
        // If this is the FIRST generation (send_count === 0), we stay in the current state (likely 'characters_approved')
        // to keep the "Send Trial" button active (Green) instead of "Resend Trial" (Orange).

        const sendCount = project?.illustration_send_count || 0

        if (sendCount > 0) {
            await supabase.from('projects')
                .update({
                    status: 'illustration_revision_needed',
                })
                .eq('id', projectId)
        }

        return NextResponse.json({
            success: true,
            illustrationUrl: publicUrl,
            pageId: pageData.id,
            aspectRatioUsed: mappedAspectRatio
        })

    } catch (error: any) {
        console.error('Illustration Generation Error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        )
    }
}
