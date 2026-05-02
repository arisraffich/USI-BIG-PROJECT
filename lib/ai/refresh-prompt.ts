export const REFRESH_PROMPT_LEGACY = `TASK: REMASTER THE ORIGINAL ILLUSTRATION

You are given two images:

IMAGE 1: ORIGINAL ILLUSTRATION
This is the exact illustration to remaster.
Preserve its composition, framing, characters, poses, facial expressions, clothing, objects, background, perspective, and scene layout exactly.

IMAGE 2: STYLE REFERENCE
Use this image only for visual quality guidance:
color palette, shades, tone, warmth/coolness, saturation, contrast, shading style, texture, line cleanliness, and rendering finish.

The final image must be the ORIGINAL ILLUSTRATION remastered with the STYLE REFERENCE'S visual quality.

Do not copy the STYLE REFERENCE'S characters, objects, scene, background, composition, poses, or story content.

PRESERVE FROM IMAGE 1:
- Exact composition and camera angle
- Exact character positions, poses, gestures, and expressions
- Exact clothing, hairstyles, accessories, and character identities
- Exact background elements, props, and object placement
- Exact scene meaning and layout

APPLY FROM IMAGE 2:
- Color palette
- Shade range
- Tonal mood
- Warmth/coolness
- Saturation and contrast
- Shading softness or hardness
- Texture quality
- Cleaner line/rendering finish
- Overall polished children's book illustration quality

FIX IN IMAGE 1:
- Blurry or soft edges
- Muddy colors
- Noisy or smeared texture
- Compression artifacts
- Inconsistent shading
- Dull or degraded rendering

DO NOT:
- Change the scene
- Move, add, or remove characters
- Move, add, or remove objects
- Change facial expressions or poses
- Copy any content from IMAGE 2
- Add text, symbols, letters, or typography

OUTPUT:
The same illustration as IMAGE 1, with only the color, texture, tone, shading, and rendering quality improved using IMAGE 2 as the visual quality reference.`

export const REFRESH_PROMPT_QUALITY_REPAIR_COLOR_CORRECTION = `TASK: QUALITY REPAIR + COLOR CORRECTION

IMAGE 1 is the source illustration.
Preserve its composition, characters, poses, expressions, objects, background, perspective, and layout exactly.

IMAGE 2 is the color and quality reference.
Use it only to guide color balance, tone, texture cleanliness, shading quality, line polish, and rendering finish.

First repair IMAGE 1:
- Remove noisy or muddy texture
- Clean smeared color areas
- Sharpen soft edges
- Improve line clarity
- Make the illustration look freshly rendered and polished

Then color-correct IMAGE 1 toward IMAGE 2:
- Match color balance
- Match warmth/coolness without adding a global yellow, orange, or sepia cast
- Match saturation and contrast level
- Match shadow softness and highlight behavior
- Preserve natural local color relationships

Keep IMAGE 1's scene content and layout unchanged.
Do not copy IMAGE 2's characters, objects, background, poses, or composition.
Only transfer IMAGE 2's color correction, texture cleanliness, shading finish, and tonal quality.

Output the same illustration as IMAGE 1, repaired and color-corrected using IMAGE 2 as the quality/color target.`

export const REFRESH_PROMPT = REFRESH_PROMPT_QUALITY_REPAIR_COLOR_CORRECTION
