export const STYLE_REFERENCE_PROMPT = `[STYLE REFERENCE IMAGE]

This is a character from a children's book. You MUST create the new character in an identical artistic style to this reference. If placed side by side, they must look like they belong on the same page of the same book.

The reference shows a different character — create a new character but replicate the exact same visual technique.

MATCH ALL OF THESE FROM THE REFERENCE:
- Medium and rendering technique (e.g., watercolor, gouache, soft digital painting)
- Stroke style, texture, shading softness, edge quality
- Color blending method and saturation levels
- Color palette warmth and tone
- Line quality and weight
- Eye drawing technique (shape style, highlights, expression style)
- Hair/fur rendering technique (strand/texture method, shading approach)
- Facial feature drawing style (nose, mouth, expression technique)
- Overall drawing complexity and detail level

If the reference is 2D/Stylized/Flat: Do NOT render fur, feathers, or scales realistically. No 3D shading, no photorealism.
If the reference is 3D/Realistic: Match that realism level.`

export const APPEARANCE_REFERENCE_PROMPT = `[APPEARANCE REFERENCE IMAGE]
This image shows what the character should look like physically.
Use it to guide the character's physical appearance, proportions, and distinctive features.
Do NOT copy the art style from this image — the style reference above defines the art style.`

export const EDIT_MODE_PROMPT = `Here is the current illustration of a character. Modify this character based on the following instruction while keeping the same art style, proportions, pose, background, and all other visual details unchanged.`
