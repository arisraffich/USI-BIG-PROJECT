import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateIllustration } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'

// Allow max duration for AI generation
export const maxDuration = 60

// Helper to map UI aspect ratios to Gemini-supported values
// When isSpread is true, returns wider aspect ratios for double-page spreads
function mapAspectRatio(ratio: string | null | undefined, isSpread: boolean = false): string {
    if (isSpread) {
        // Spread (double-page) aspect ratios
        switch (ratio) {
            case '8:10': return '3:2';       // Portrait spread
            case '8.5:8.5': return '21:9';   // Square spread (2.33:1 - double square)
            case '8.5:11': return '3:2';     // Letter spread
            default: return '3:2';
        }
    }
    // Single page aspect ratios
    switch (ratio) {
        case '8:10': return '4:5';
        case '8.5:8.5': return '1:1';
        case '8.5:11': return '3:4'; // Closest match for Letter
        default: return '1:1';
    }
}

// Type for scene character passed from frontend
interface SceneCharacterInput {
    id: string
    name: string
    imageUrl: string | null
    action: string
    emotion: string
    isIncluded: boolean
    isModified: boolean
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { 
            projectId, 
            pageId, 
            customPrompt, 
            currentImageUrl, 
            referenceImages: uploadedReferenceImages, 
            referenceImageUrl,
            sceneCharacters, // New: Character overrides for Scene Recreation mode
            skipDbUpdate // New: For comparison mode - upload but don't save to DB
        } = body as {
            projectId: string
            pageId?: string
            customPrompt?: string
            currentImageUrl?: string
            referenceImages?: string[]
            referenceImageUrl?: string
            sceneCharacters?: SceneCharacterInput[]
            skipDbUpdate?: boolean
        }

        // Debug: Log mode detection
        if (referenceImageUrl) {
            console.log('[Illustration Generate] 🎬 Scene Recreation Mode - manual reference image selected')
            if (sceneCharacters?.length) {
                const includedChars = sceneCharacters.filter(c => c.isIncluded)
                console.log(`[Illustration Generate] 👥 Character overrides: ${includedChars.length} characters selected`)
            }
        } else if (customPrompt || uploadedReferenceImages?.length) {
            console.log('[Illustration Generate] ✏️ Edit Mode - custom prompt/reference images provided')
        } else {
            console.log('[Illustration Generate] 📄 Standard Mode - using default reference (Page 1 or main character)')
        }

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
        }

        // ... (existing code for fetching project and page) ...
        const supabase = await createAdminClient()

        // 1. Fetch Project Configuration (Always needed for ratio + style references)
        const { data: project } = await supabase
            .from('projects')
            .select('illustration_aspect_ratio, illustration_text_integration, illustration_send_count, status, style_reference_urls')
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

        // Check illustration type (spread, spot, or normal)
        // Support both new illustration_type field and legacy is_spread for backward compatibility
        const illustrationType = pageData.illustration_type || (pageData.is_spread ? 'spread' : null)
        const isSpread = illustrationType === 'spread'
        const isSpot = illustrationType === 'spot'
        const mappedAspectRatio = mapAspectRatio(project?.illustration_aspect_ratio || undefined, isSpread)
        
        if (isSpread) {
            console.log(`[Illustration Generate] 📖 SPREAD MODE - Page ${pageData.page_number} using ${mappedAspectRatio} aspect ratio`)
        }
        if (isSpot) {
            console.log(`[Illustration Generate] 🔵 SPOT MODE - Page ${pageData.page_number} (children's book spot illustration)`)
        }
        let fullPrompt = ''
        let characterReferences: any[] = []
        let anchorImage: string | null = null
        let styleReferenceImages: string[] = []
        let hasCustomStyleRefs = false // Declared at outer scope, set in Standard Mode
        
        // --- MODE DETECTION (Priority Order) ---
        // 1. Scene Recreation Mode: referenceImageUrl is present (dropdown selection)
        // 2. Edit Mode: customPrompt OR uploadedReferenceImages with currentImageUrl
        // 3. Standard Mode: Default generation
        const hasReferences = (uploadedReferenceImages?.length ?? 0) > 0
        const isSceneRecreationMode = !!referenceImageUrl
        const isEditMode = !isSceneRecreationMode && (customPrompt || hasReferences) && currentImageUrl

        if (isEditMode) {
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
            // Standard Mode OR Scene Recreation Mode: Fetch Characters & Build AI Director Prompt
            const { data: characters } = await supabase
                .from('characters')
                .select('id, name, role, image_url, is_main')
                .eq('project_id', projectId)
                .not('image_url', 'is', null)
                .order('is_main', { ascending: false }) // Put Main Character (true) first
                .order('created_at', { ascending: true }) // Then by creation

            // Map to new structure for Interleaved Prompting
            let mainCharacterName = '';
            
            // Check if we have character overrides from Scene Recreation mode
            const hasCharacterOverrides = sceneCharacters && sceneCharacters.length > 0
            const includedCharacterIds = hasCharacterOverrides 
                ? new Set(sceneCharacters.filter(c => c.isIncluded).map(c => c.id))
                : null

            if (characters) {
                characterReferences = characters
                    // Filter to only included characters if we have overrides
                    .filter(c => {
                        if (!includedCharacterIds) return true // No overrides, include all
                        return includedCharacterIds.has(c.id)
                    })
                    .map((c, index) => {
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
                
                // Log character filtering
                if (hasCharacterOverrides) {
                    console.log(`[Illustration Generate] 👥 Character filter: ${characterReferences.length} of ${characters.length} characters included`)
                }
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
            // Use isSceneRecreationMode from outer scope
            
            // Check if project has custom style references (for sequels or style matching)
            const projectStyleRefs = project?.style_reference_urls || []
            hasCustomStyleRefs = projectStyleRefs.length > 0
            
            if (referenceImageUrl) {
                console.log('[Illustration Generate] 🎬 Scene Recreation Mode - using reference image as base scene')
                // MANUAL OVERRIDE - Environment Consistency Mode
                anchorImage = referenceImageUrl
            } else if (pageData.page_number > 1) {
                // PAGES 2-N: Use Page 1 as Style Anchor (maintains internal consistency)
                // Prefer original_illustration_url (immutable first generation) to prevent quality degradation
                const { data: p1 } = await supabase
                    .from('pages')
                    .select('illustration_url, original_illustration_url')
                    .eq('project_id', projectId)
                    .eq('page_number', 1)
                    .single()
                const page1Anchor = p1?.original_illustration_url || p1?.illustration_url
                if (page1Anchor) {
                    anchorImage = page1Anchor
                    if (p1?.original_illustration_url) {
                        console.log('[Illustration Generate] 📌 Using Page 1 ORIGINAL illustration as style anchor (quality preserved)')
                    }
                }
            } else if (pageData.page_number === 1) {
                // PAGE 1: Check for custom style references first
                if (hasCustomStyleRefs) {
                    // Use FIRST style reference as anchor, others go to styleReferenceImages
                    console.log(`[Illustration Generate] 🎨 Using ${projectStyleRefs.length} custom style reference(s) for Page 1`)
                    anchorImage = projectStyleRefs[0]
                    // Add remaining style refs (if any) to the styleReferenceImages array
                    if (projectStyleRefs.length > 1) {
                        styleReferenceImages = projectStyleRefs.slice(1)
                    }
                } else {
                    // DEFAULT: Use MAIN CHARACTER as the Style Anchor for the scene
                    // This ensures the forest/background matches the character's vector style.
                    const mainChar = characters?.find(c => c.is_main)
                    if (mainChar?.image_url) {
                        anchorImage = mainChar.image_url
                    }
                }
            }

            // Construct Prompt - Character Actions
            let actionDescription = ''
            
            // Use sceneCharacters overrides if provided (Scene Recreation with character control)
            if (hasCharacterOverrides && sceneCharacters) {
                const includedChars = sceneCharacters.filter(c => c.isIncluded)
                includedChars.forEach((char) => {
                    const charLabel = char.name || 'Character'
                    if (char.action) actionDescription += `${charLabel} Action: ${char.action}. `
                    if (char.emotion) actionDescription += `${charLabel} Emotion: ${char.emotion}. `
                })
                console.log(`[Illustration Generate] 📝 Using custom character actions from UI`)
            } else {
                // Use AI Director's character actions from the page
                const characterActions = pageData.character_actions || {}
                if (characterActions) {
                    Object.entries(characterActions).forEach(([charName, action]: [string, any]) => {
                        if (action.action) actionDescription += `${charName} Action: ${action.action}. `
                        if (action.pose) actionDescription += `${charName} Pose: ${action.pose}. `
                        if (action.emotion) actionDescription += `${charName} Emotion: ${action.emotion}. `
                    })
                }
            }

            // Scrub the descriptions
            const cleanSceneDescription = scrubText(pageData.scene_description || 'A scene from the story.')
            const cleanActionDescription = scrubText(actionDescription || 'No specific character actions.')

            // Determine text integration: per-page setting takes priority, then fall back to project default
            const pageTextIntegration = pageData.text_integration
            const projectTextIntegration = project?.illustration_text_integration
            const isIntegrated = pageTextIntegration 
                ? pageTextIntegration === 'integrated'
                : projectTextIntegration === 'integrated'
            
            const storyText = pageData.story_text || ''
            let textPromptSection = ''

            if (isIntegrated) {
                // Base text integration rules
                let textPlacementRules: string
                
                if (isSpread) {
                    // SPREAD-SPECIFIC text placement: RIGHT side, avoid center gutter
                    textPlacementRules = `TEXT PLACEMENT FOR SPREAD (CRITICAL):
- This is a double-page spread. The center 10% is the gutter/binding zone where the book folds.
- Position text-safe areas on the RIGHT SIDE of the spread, away from the center.
- NEVER place text-safe areas in the center 10% of the image (the gutter zone).
- For short text, reserve one calm text area on the right portion.
- For long text, you may use areas on the right side at different vertical positions.`
                } else {
                    // Single page text placement: TOP and/or BOTTOM
                    textPlacementRules = `TEXT PLACEMENT FOR SINGLE PAGE:
- For short text, reserve one calm text area.
- For long or multi-paragraph text, reserve larger areas, typically at the TOP and/or BOTTOM of the illustration.
- If the text contains multiple paragraphs, you may split the layout into multiple text-safe areas.`
                }
                
                textPromptSection = `TEXT INTEGRATION & LAYOUT INSTRUCTIONS:

The following story text is provided ONLY to determine layout and spacing.
It must NOT be drawn or rendered inside the illustration.

"${storyText}"

You must plan the illustration composition around this text BEFORE finalizing the scene.

CRITICAL RULE — NO TEXT DRAWING (ABSOLUTE):
Do NOT draw, write, paint, render, or include ANY visible text, letters, words, symbols, handwriting, or placeholder typography inside the illustration.
The illustration must contain ZERO visible text of any kind — not even placeholder or dummy text.
NEVER place any text inside the text-safe areas. These areas must remain completely empty and clean.
Your responsibility is layout planning only.

IMPORTANT:
You are NOT responsible for final typography.
Your task is to CREATE appropriate text-safe areas or text containers that will later receive the final text rendered by the application.

TEXT PLANNING RULES:
- Analyze the length, structure, and paragraph count of the provided story text.
- Based on the text length, intentionally reserve sufficient visual space for the text.
${textPlacementRules}

TEXT AREA DESIGN:
- Use harmonious visual solutions appropriate to the illustration style (soft background washes, framed negative space, sky, walls, floor, or other calm zones).
- Text-safe areas must NOT resemble signs, banners, labels, or UI elements.
- Do NOT use speech bubbles, thought bubbles, captions, or dialogue containers.
- Text areas must feel intentionally designed as part of the composition, not overlaid.
- Text-safe areas must be COMPLETELY EMPTY — no text, no placeholders, no symbols.

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
The illustration must look intentionally composed to include text, following professional children's book layout standards, while containing NO drawn text at all.

FAILSAFE RULE:
If there is any conflict between illustration detail and text readability, text readability takes priority over background decoration.`
            } else {
                textPromptSection = `STORY CONTEXT (FOR SCENE MOOD ONLY):
"${storyText}"

IMPORTANT: Do NOT render any text in the illustration. The story text will be printed on a separate page.`
            }

            // Determine Style Instructions Block - Differentiated Logic
            let styleInstructions: string;
            
            // Check if using custom style references (for Page 1)
            const usingCustomStyleRefs = pageData.page_number === 1 && hasCustomStyleRefs
            
            if (isSceneRecreationMode) {
                // SCENE RECREATION MODE: Edit the reference image, keep background, change characters
                // Include optional user instructions if provided
                const userInstructionsSection = customPrompt 
                    ? `\n\nADDITIONAL USER INSTRUCTIONS (IMPORTANT):\n${customPrompt}`
                    : ''
                
                styleInstructions = `TASK: SCENE RECREATION WITH NEW CHARACTER ACTIONS

STORY CONTEXT:
${cleanSceneDescription}

CHARACTER ACTIONS & EMOTIONS (CRITICAL - BRING CHARACTERS TO LIFE):
${cleanActionDescription}

IMPORTANT CHARACTER DIRECTION:
- Make characters EXPRESSIVE and DYNAMIC - not static or stiff
- Show CLEAR EMOTIONS on faces: joy, surprise, curiosity, concern, excitement, etc.
- Use DYNAMIC body language: leaning, reaching, gesturing, reacting
- Characters should feel ALIVE and IN THE MOMENT
- Capture the FEELING of the scene, not just the pose

BACKGROUND PRESERVATION:
- The provided scene image is your BASE - use it as the foundation
- REMOVE all animated characters currently visible in the scene
- Keep ONLY the environment/background EXACTLY as shown

CHARACTER PLACEMENT:
- Draw the character references performing the actions described above
- Use COMPLETELY NEW poses (not copied from reference image)
- Position characters naturally within the preserved environment

STYLE & QUALITY:
- Maintain the same art style as the reference image
- Render at high vector-like quality (crisp, clean lines)
- Match the color palette and rendering technique

ATMOSPHERE/LIGHTING:
${pageData.atmosphere || 'Natural lighting and mood.'}
Apply this mood through lighting, colors, and overall tone.

SCENE VARIETY (choose ONE from each):

FRAMING (pick ONE):
• Show more of the left or right side of the scene
• Include more of the ceiling/sky or floor/ground in the frame
• Frame the scene as a closer or wider view

SHOT TYPE (pick ONE):
• WIDE SHOT: Full environment with characters smaller in frame
• MEDIUM SHOT: Characters from waist up, balanced with environment
• CLOSE-UP: Focus on character emotions, environment as backdrop
${userInstructionsSection}

OUTPUT REQUIREMENTS:
- SAME environment/background (preserved from reference)
- EXPRESSIVE, DYNAMIC characters performing described actions
- Clear emotions visible on character faces
- High quality, seamless integration`
            } else if (usingCustomStyleRefs && anchorImage) {
                // CUSTOM STYLE REFERENCE MODE: Use uploaded style references as the master style
                const styleRefCount = 1 + styleReferenceImages.length // anchor + additional refs
                styleInstructions = `STYLE & RENDERING RULES (CUSTOM STYLE REFERENCE MODE):

IMPORTANT: You have been provided with ${styleRefCount} STYLE REFERENCE IMAGE(S).
These images define the TARGET ARTISTIC STYLE for this illustration.

1. STYLE EXTRACTION (CRITICAL):
   - Analyze the style reference image(s) to extract: Art medium, color palette, line quality, shading technique, texture, and overall aesthetic.
   - The combined style of these reference(s) is your MASTER STYLE GUIDE.
   - Match this style PRECISELY across ALL elements of the illustration.

2. STYLE APPLICATION:
   - Apply the extracted style to: Characters, Background, Props, Lighting, and all environmental elements.
   - Render the BACKGROUND in the EXACT SAME ART STYLE as shown in the style reference(s).
   - If the style is 2D/Flat/Vector, keep everything 2D/Flat/Vector.
   - If the style is painterly/textured, apply similar brushwork throughout.

3. CHARACTER IDENTITY vs STYLE:
   - The CHARACTER REFERENCE IMAGES define WHO appears (identity, features, clothing).
   - The STYLE REFERENCE IMAGES define HOW everything is rendered (artistic style).
   - Keep character identities intact but render them IN THE STYLE of the style references.

4. UNIFIED DIMENSIONALITY:
   - All elements must feel like they belong in the same artistic universe.
   - Match the level of detail, saturation, and rendering technique from the style reference(s).`
            } else if (anchorImage) {
                // DEFAULT MODE: Style Consistency (using main character as style anchor)
                styleInstructions = `STYLE & RENDERING RULES (STRICT CONSISTENCY):
1. GLOBAL STYLE ANCHOR:
   - Use the "Main Character" reference image as the MASTER STYLE for the entire scene.
   - Render the BACKGROUND (and all environmental elements) in the EXACT SAME ART STYLE (Medium, Brushwork, Dimensionality) as the character.
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

            // Build BACKGROUND section conditionally
            const backgroundSection = isSceneRecreationMode 
                ? '' // Omit in scene recreation mode - reference image defines environment
                : `BACKGROUND:
${pageData.background_elements || 'Appropriate background for the scene.'}

`

            // Build illustration type composition rules (spread or spot)
            let illustrationTypeRules = ''
            if (isSpread) {
                illustrationTypeRules = `
SPREAD COMPOSITION RULES (CRITICAL):
This is a double-page spread that will be bound in the center.
- NEVER place important characters, faces, or key focal elements in the center 10% of the image.
- The center 10% is the gutter/binding zone where the book folds - content here will be hidden or distorted.
- Distribute characters and key visual elements on the LEFT third or RIGHT third of the composition.
- Design the scene to read well as a panoramic, wide-format illustration.

`
            } else if (isSpot) {
                illustrationTypeRules = `
SPOT ILLUSTRATION (CRITICAL - CHILDREN'S BOOK):
This is a children's book spot illustration, NOT a full-page illustration.

COMPOSITION RULES:
- VIGNETTE/FLOATING: The illustration must NOT fill the entire canvas. Leave white space.
- NO HARD BORDERS: The image should fade, bleed, or soften at the edges naturally.
- The illustration should "float" on a WHITE BACKGROUND - do NOT render a full rectangular scene.

SUBJECT RULES:
- SINGLE FOCAL POINT: Focus on ONE clear subject (character or object). No complex scenes.
- MINIMAL/NO BACKGROUND: Background is either absent, abstractly suggested, or fades to white.
- COMPACT SCALE: Design to work at smaller sizes. Keep it simple and readable.

`
            }

            // Build fullPrompt differently for scene recreation vs standard generation
            if (isSceneRecreationMode) {
                // Scene Recreation: Use the streamlined prompt (styleInstructions has everything)
                fullPrompt = `${illustrationTypeRules}${styleInstructions}

${textPromptSection}`
            } else {
                // Standard Generation: Full detailed prompt
                fullPrompt = `TASK: ILLUSTRATION GENERATION
${illustrationTypeRules}
SCENE Context:
${cleanSceneDescription}

CHARACTER ACTION:
${cleanActionDescription}
(Character: "[MAIN CHARACTER]").

${backgroundSection}ATMOSPHERE:
${pageData.atmosphere || 'Natural lighting and mood.'}

${styleInstructions}

${textPromptSection}`
            }
        }

        // 5. Generate with Google AI
        // Pass isSceneRecreation flag for higher quality input/output in Scene Recreation mode
        // (referenceImageUrl indicates manual page selection = Scene Recreation mode)
        // Pass hasCustomStyleRefs to disable main character style anchoring when custom style refs exist
        
        // DEBUG: Log the full prompt being sent
        console.log('\n========== FULL PROMPT TO GEMINI ==========')
        console.log(fullPrompt)
        console.log('============================================\n')
        console.log('[Illustration Generate] Character references:', characterReferences.map(c => c.name))
        
        const result = await generateIllustration({
            prompt: fullPrompt,
            characterReferences: characterReferences,
            anchorImage: anchorImage,
            styleReferenceImages: styleReferenceImages,
            aspectRatio: mappedAspectRatio,
            isSceneRecreation: isSceneRecreationMode,
            hasCustomStyleRefs: hasCustomStyleRefs
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

        // 7. Update Page Record (skip if in comparison mode)
        // Update illustration URL and mark any feedback as resolved (same pattern as character regeneration)

        if (!skipDbUpdate) {
            // Save original_illustration_url on first generation (immutable quality reference)
            const isFirstGeneration = !pageData.original_illustration_url
            
            await supabase.from('pages')
                .update({
                    illustration_url: publicUrl,
                    is_resolved: true, // Mark feedback as resolved after regeneration
                    ...(isFirstGeneration ? { original_illustration_url: publicUrl } : {}),
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
        }

        return NextResponse.json({
            success: true,
            illustrationUrl: publicUrl,
            pageId: pageData.id,
            aspectRatioUsed: mappedAspectRatio,
            isSpread: isSpread, // Deprecated: use illustrationType
            illustrationType: illustrationType,
            isPreview: !!skipDbUpdate // Indicate this is a preview (not saved to DB)
        })

    } catch (error: unknown) {
        console.error('Illustration Generation Error:', error)
        return NextResponse.json(
            { error: getErrorMessage(error, 'Internal Server Error') },
            { status: 500 }
        )
    }
}
