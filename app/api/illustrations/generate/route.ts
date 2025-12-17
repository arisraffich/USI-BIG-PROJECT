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
        const body = await request.json()
        const { projectId, pageId, customPrompt, currentImageUrl, referenceImages: uploadedReferenceImages, referenceImageUrl } = body


        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
        }

        // ... (existing code for fetching project and page) ...
        const supabase = await createAdminClient()

        // 1. Fetch Project Configuration (Always needed for ratio)
        const { data: project } = await supabase
            .from('projects')
            .select('illustration_aspect_ratio, illustration_text_integration, illustration_send_count, status')
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

        const mappedAspectRatio = mapAspectRatio(project?.illustration_aspect_ratio || undefined)
        let fullPrompt = ''
        let characterReferences: any[] = []
        let anchorImage: string | null = null
        let styleReferenceImages: string[] = []

        // --- EDIT MODE vs STANDARD MODE ---
        const hasReferences = uploadedReferenceImages?.length > 0

        if ((customPrompt || hasReferences) && currentImageUrl) {
            // Edit Mode: Use User Prompt + Current Image as Anchor + Uploaded References
            fullPrompt = `MODE: IMAGE EDITING
INSTRUCTIONS:
${customPrompt}

IMAGE CONTEXT:
1. The provided "STYLE REFERENCE" (Anchor) is the "Target Image" to be edited. Keep its composition and style unless instructed otherwise.
2. Any "Additional Visual References" are guides for the requested changes.`

            anchorImage = currentImageUrl
            styleReferenceImages = uploadedReferenceImages || []

        } else {
            // Standard Mode: Fetch Characters & Build AI Director Prompt
            const { data: characters } = await supabase
                .from('characters')
                .select('id, name, role, image_url, is_main')
                .eq('project_id', projectId)
                .not('image_url', 'is', null)
                .order('is_main', { ascending: false }) // Put Main Character (true) first
                .order('created_at', { ascending: true }) // Then by creation

            // Map to new structure for Interleaved Prompting
            let mainCharacterName = '';

            if (characters) {
                characterReferences = characters.map((c, index) => {
                    let safeName = c.name || `Character ${index + 1}`

                    if (c.is_main) {
                        mainCharacterName = c.name || ''
                        safeName = "THE MAIN CHARACTER"
                    }

                    return {
                        name: safeName,
                        imageUrl: c.image_url!,
                        role: c.role || undefined,
                        isMain: c.is_main
                    }
                })
            }

            // SCRUBBING LOGIC: Remove the Main Character's species name from the text
            // This prevents "Hedgehog" leaks while keeping "Owl" (Secondary) intact for context
            const scrubText = (text: string) => {
                if (!text || !mainCharacterName) return text
                // Create a regex to replace the name case-insensitively
                // We use word boundaries \b. We also handle plurals (s) and possessives ('s) optionally.
                try {
                    const regex = new RegExp(`\\b${mainCharacterName}(?:'s|s)?\\b`, 'gi')
                    return text.replace(regex, "THE MAIN CHARACTER")
                } catch (e) {
                    return text
                }
            }

            // FETCH ANCHOR IMAGE
            if (referenceImageUrl) {
                // MANUAL OVERRIDE
                anchorImage = referenceImageUrl
            } else if (pageData.page_number > 1) {
                // PAGES 2-N: Use Page 1 as Style Anchor
                const { data: p1 } = await supabase
                    .from('pages')
                    .select('illustration_url')
                    .eq('project_id', projectId)
                    .eq('page_number', 1)
                    .single()
                if (p1?.illustration_url) {
                    anchorImage = p1.illustration_url
                }
            } else if (pageData.page_number === 1) {
                // PAGE 1: SELF-ANCHORING (CRITICAL FIX)
                // Use the MAIN CHARACTER as the Style Anchor for the scene itself.
                // This ensures the forest/background matches the character's vector style.
                const mainChar = characters?.find(c => c.is_main)
                if (mainChar?.image_url) {
                    anchorImage = mainChar.image_url
                }
            }

            // Construct Prompt
            const characterActions = pageData.character_actions || {}
            let actionDescription = ''

            if (characterActions) {
                Object.values(characterActions).forEach((action: any) => {
                    if (action.action) actionDescription += `Character Action: ${action.action}. `
                    if (action.pose) actionDescription += `Pose: ${action.pose}. `
                    if (action.emotion) actionDescription += `Emotion: ${action.emotion}. `
                })
            }

            // Scrub the descriptions
            const cleanSceneDescription = scrubText(pageData.scene_description || 'A scene from the story.')
            const cleanActionDescription = scrubText(actionDescription || 'No specific character actions.')

            const isIntegrated = project?.illustration_text_integration === 'integrated'
            const storyText = pageData.story_text || ''
            let textPromptSection = ''

            if (isIntegrated) {
                textPromptSection = `TEXT INTEGRATION & LAYOUT INSTRUCTIONS:
The following story text is provided ONLY to determine layout and spacing.
It must NOT be drawn or rendered inside the illustration.

"${storyText}"

You must plan the illustration composition around this text BEFORE finalizing the scene.
CRITICAL RULE — NO TEXT DRAWING:
The illustration must contain ZERO visible text of any kind.
You are NOT responsible for final typography.
Your task is to CREATE appropriate text-safe areas or text containers that will later receive the final text rendered by the application.`
            } else {
                textPromptSection = `STORY CONTEXT (FOR SCENE MOOD ONLY):
"${storyText}"

IMPORTANT: Do NOT render any text in the illustration. The story text will be printed on a separate page.`
            }

            // Determine Style Instructions Block - UPDATED FOR GENERIC NAMES
            let styleInstructions: string;
            // Note: anchorImage is now TRUE for Page 1 too (Self-Anchoring)
            if (anchorImage) {
                styleInstructions = `STYLE & RENDERING RULES (STRICT CONSISTENCY):
1. GLOBAL STYLE ANCHOR:
   - Use the "Main Character" reference image as the MASTER STYLE for the entire scene.
   - Render the FOREST (and all background elements) in the EXACT SAME ART STYLE (Medium, Brushwork, Dimensionality) as the character.
   - If the character is 2D/Flat, the background MUST be 2D/Flat. If the character is 3D/Realistic, the background MUST be 3D/Realistic.
   - The goal is perfect stylistic unity.

2. SUBJECT RENDERING (CRITICAL - NO UNINTENDED REALISM):
   - Do NOT apply "Hero Lighting" or "Realistic Details" UNLESS the reference image explicitly has them.
   - Do NOT add fur texture, hair strands, or 3D shading UNLESS the reference image has them.
   - If the Main Character reference is FLAT (Vector/2D), you must render it FLAT in the scene.
   - Treat the Main Character as a "Asset" placed in the scene. Match its style exactly.

3. UNIFIED DIMENSIONALITY:
   - The Character and the Background must look like they exist in the same artistic universe.
   - Do not mix 2D characters with 3D backgrounds.`
            } else {
                // Fallback if no Main Character Image (Rare)
                styleInstructions = `STYLE & TECHNIQUE INSTRUCTIONS:
1. CHARACTER IDENTITY (ABSOLUTE PRIORITY):
   - You have been provided with explicit visual references.
   - The Main Character's style dictates the scene style.`
            }

            fullPrompt = `TASK: ILLUSTRATION GENERATION

SCENE Context:
${cleanSceneDescription}

CHARACTER ACTION:
${cleanActionDescription}
(Character: "[MAIN CHARACTER]").

BACKGROUND:
${pageData.background_elements || 'Appropriate background for the scene.'}

${styleInstructions}

${textPromptSection}`
        }

        // 5. Generate with Google AI
        const result = await generateIllustration({
            prompt: fullPrompt,
            characterReferences: characterReferences,
            anchorImage: anchorImage,
            styleReferenceImages: styleReferenceImages,
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
        // Only update the internal illustration URL. 
        // Resolution and history update will happen when Admin clicks "Resend Trial" (Send to Customer).

        await supabase.from('pages')
            .update({
                illustration_url: publicUrl,
            })
            .eq('id', pageData.id)

        // 8. Update Project Status (Enable Resend Flow)
        // Only update status to 'illustration_revision_needed' if we have already sent the trial at least once.
        // AND if we are NOT in the 'illustration_approved' (Production) phase.
        // In Production, we want to stay 'illustration_approved' so the "Send Illustrations" button remains active.

        const sendCount = project?.illustration_send_count || 0
        const currentStatus = project?.status

        if (sendCount > 0 && currentStatus !== 'illustration_approved') {
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
