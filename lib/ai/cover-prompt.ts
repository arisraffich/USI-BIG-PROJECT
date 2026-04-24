/**
 * Cover Design prompt template for GPT-2.
 *
 * Substitutions expected at generation time:
 *   <ASPECT_RATIO>  — via mapAspectRatioToCoverLabel()
 *   <TITLE>         — admin-entered
 *   <SUBTITLE>      — admin-entered (if empty, the subtitle line is stripped entirely)
 *   <AUTHOR>        — author_firstname + " " + author_lastname from DB
 */
export const COVER_PROMPT_TEMPLATE = `TASK: CHILDREN'S BOOK FRONT COVER

You are a professional graphic designer. Design a print-ready front cover for a children's book. You are given ONE reference illustration from the book's interior. Match its art style exactly and feature its characters as the focal point of the cover.

Important: do not simply reuse the interior illustration as-is with text placed on top. Recompose and redesign it as a polished front cover while preserving the same characters, style, mood, and visual world.

STYLE:
- Match the reference illustration exactly: same medium, linework, palette, shading, and lighting.
- Characters must look identical to the reference: face, hair, clothing, proportions.

ASPECT RATIO:
- Output aspect ratio: <ASPECT_RATIO>.
- Compose the cover naturally within these proportions.
- Do not stretch, squeeze, distort, or letterbox. Characters and objects must look naturally proportioned for this format.

COMPOSITION:
- Hero-style framing featuring the main character(s) from the reference.
- Make the image feel intentionally designed as a book cover, not an interior page.
- Use a simple, complementary background.
- Keep busy areas away from where text will sit.
- Leave clear natural space for the title, subtitle, and author line.

SAFE AREA:
- Keep title, subtitle, author line, and important character faces comfortably inside the inner 85-90% of the cover.
- Background artwork may extend fully to the edges; text and key faces must stay away from the outer edges.
- Do not place the title, subtitle, or author line touching or nearly touching any edge.
- Do not place the author line at the very bottom edge.

TEXT:
- Render the text exactly as written, with no typos.
- Title: "<TITLE>"
- Subtitle, only if provided: "<SUBTITLE>"
- Author line: "Written by <AUTHOR>"

TYPOGRAPHY:
- Title: large, bold, highly readable, friendly children's-book feel.
- Subtitle, if present: smaller than the title.
- Author line: smaller than the title, clean, legible, formatted exactly as "Written by <AUTHOR>".
- Place title, subtitle, and author line wherever they create the strongest cover composition.
- The author line does not have to be at the bottom; it may sit under the title, in the lower third, or another clean area if more readable and safely inside the safe area.
- Do not use text boxes, banners, labels, ribbons, or visible panels behind the text.
- Keep text readable by composing the illustration with natural low-detail space behind it.

CONSTRAINTS:
- No 3D effects, bevels, or stock-clip-art shadows.
- No photographic filters or plastic gloss.
- No extra text: no ISBN, barcodes, watermarks, page numbers, publisher logo, or tagline.
- No decorative border or frame.
- No book mockup, spine, back cover, or 3D product render.
- Print-ready: crisp, clean, professional.`

/**
 * Human-friendly aspect ratio label injected into the cover prompt.
 * Mapped from projects.illustration_aspect_ratio.
 */
export function mapAspectRatioToCoverLabel(ratio: string | null | undefined): string {
    switch (ratio) {
        case '8:10':    return '4:5 (portrait)'
        case '8.5:8.5': return '1:1 (square)'
        case '8.5:11':  return 'portrait, approximately 3:4'
        default:        return '1:1 (square)'
    }
}

/**
 * Fills the cover prompt template with the given fields.
 * If subtitle is empty/whitespace, the entire subtitle line is stripped.
 */
export function buildCoverPrompt(opts: {
    aspectRatio: string | null | undefined
    title: string
    subtitle?: string | null
    author: string
}): string {
    const aspectLabel = mapAspectRatioToCoverLabel(opts.aspectRatio)
    const hasSubtitle = !!(opts.subtitle && opts.subtitle.trim())

    let prompt = COVER_PROMPT_TEMPLATE
        .replace('<ASPECT_RATIO>', aspectLabel)
        .replace('<TITLE>', opts.title)
        .replace(/<AUTHOR>/g, opts.author)

    if (hasSubtitle) {
        prompt = prompt.replace('<SUBTITLE>', (opts.subtitle as string).trim())
    } else {
        // Strip the whole subtitle line so the model doesn't render an empty placeholder.
        prompt = prompt.replace(/^- Subtitle, only if provided: "<SUBTITLE>"\n/m, '')
    }

    return prompt
}

/**
 * Front cover EDIT prompt — used when admin regenerates a front cover and
 * keeps the same source page (i.e. they want to tweak the existing cover, not
 * redesign it from scratch). Mirrors the illustration "Edit Mode" pattern:
 * the provided image IS the target, admin instructions drive changes, and the
 * model preserves everything else.
 *
 * Substitutions:
 *   <ASPECT_RATIO> — via mapAspectRatioToCoverLabel()
 */
export const COVER_EDIT_PROMPT_TEMPLATE = `MODE: COVER EDIT

The provided image is the current front cover of a children's book. Treat it as the target image to edit, not as inspiration.

Keep the composition, subjects, background, colors, typography, and overall style exactly as they are. Do not recompose or redesign. Apply only the changes described in the admin instructions below — if the instructions do not mention a change, do not change it.

Output aspect ratio: <ASPECT_RATIO>. Do not stretch, squeeze, distort, or letterbox.`

/**
 * Fills the cover-edit prompt template with the project's aspect ratio.
 * Everything else is left to the admin instructions that get appended by the
 * API layer.
 */
export function buildCoverEditPrompt(opts: {
    aspectRatio: string | null | undefined
}): string {
    const aspectLabel = mapAspectRatioToCoverLabel(opts.aspectRatio)
    return COVER_EDIT_PROMPT_TEMPLATE.replace('<ASPECT_RATIO>', aspectLabel)
}

/**
 * Front cover REMASTER prompt — quality refresh only. This is intentionally
 * stricter than the general illustration refresh prompt because book-cover
 * typography must remain readable and spelled exactly the same.
 */
export const COVER_REMASTER_PROMPT_TEMPLATE = `TASK: FRONT COVER QUALITY REMASTER

You are given ONE reference image: the current completed front cover of a children's book. Re-render this exact cover at maximum print fidelity.

ABSOLUTE PRESERVATION RULES:
- Preserve the exact same composition, framing, crop, aspect ratio, and layout.
- Preserve every character, object, background element, and decorative element in the exact same position.
- Preserve all title, subtitle, and author typography exactly: same words, spelling, capitalization, placement, size relationship, color, and style.
- Preserve the exact same art style, medium, palette, lighting, shadows, texture, and mood.
- Do not redesign, recompose, simplify, expand, crop, or reinterpret the cover.

QUALITY IMPROVEMENT ONLY:
- Improve sharpness, edge clarity, print polish, texture fidelity, and overall cleanliness.
- Clean up softness, blur, compression artifacts, or muddy rendering.
- Make the same cover look crisper and more professionally finished.

DO NOT:
- Do not change, add, remove, or reposition anything.
- Do not alter character faces, expressions, poses, clothing, or proportions.
- Do not alter, rewrite, misspell, or restyle any text.
- Do not add new text, logos, barcodes, borders, frames, or mockup elements.

ASPECT RATIO:
- Output aspect ratio: <ASPECT_RATIO>.
- Do not stretch, squeeze, distort, crop awkwardly, or letterbox.

OUTPUT: The same front cover, remastered cleanly at maximum quality.`

export function buildCoverRemasterPrompt(opts: {
    aspectRatio: string | null | undefined
}): string {
    const aspectLabel = mapAspectRatioToCoverLabel(opts.aspectRatio)
    return COVER_REMASTER_PROMPT_TEMPLATE.replace('<ASPECT_RATIO>', aspectLabel)
}

/**
 * Back cover = minimal background plate (InDesign gets text/barcode later).
 * Reference is a flat front-cover image only — prompt asks the model to infer
 * atmosphere “behind” the hero and extend it without redrawing the story.
 *
 * Substitutions:
 *   <ASPECT_RATIO> — via mapAspectRatioToCoverLabel()
 */
export const BACK_COVER_PROMPT_TEMPLATE = `TASK: CHILDREN'S BOOK BACK COVER — MINIMAL BACKGROUND

Create a matching back cover from the provided front cover reference.

This image is NOT a story illustration. It is a quiet background surface for later book description text in InDesign.

PRIMARY GOAL:
- Create a mostly empty, low-detail background.
- Use the same color palette, lighting, texture, and art style as the front cover.
- Use the simplest non-character background feeling from the front cover.
- The back cover should feel related to the front, but much simpler and calmer.

COMPOSITION:
- Keep at least 80% of the image as open, low-detail space.
- The center must be especially clean and quiet.
- Use only soft color, subtle texture, gentle tonal variation, and very minimal atmospheric detail.
- Any decorative detail must be tiny, sparse, and pushed to the far edges or corners.
- No central subject.
- No scene action.
- No storytelling moment.
- No foreground.

STRICT LIMITS:
- Do not create a landscape, full setting, room, environment, or detailed scene.
- Do not add paths, roads, fences, buildings, furniture, vehicles, characters, animals, faces, bodies, props, signs, or symbols.
- Do not fill the bottom with grass, flowers, objects, texture, or decorative clutter.
- Do not fill the sides with large trees, branches, objects, or patterns.
- Do not copy the front cover composition.
- Do not make the back cover visually busy.

TEXT / SYMBOLS:
- No text of any kind.
- No title, subtitle, author line, blurb, barcode, ISBN, logo, letters, numbers, symbols, labels, signs, or watermarks.

ASPECT RATIO:
- Output aspect ratio: <ASPECT_RATIO>.
- Do not stretch, squeeze, distort, crop awkwardly, or letterbox.

QUALITY:
- Match the front cover's style and palette.
- Print-ready, clean, professional.`

/**
 * Builds the back-cover prompt with the project's aspect ratio injected.
 */
export function buildBackCoverPrompt(opts: {
    aspectRatio: string | null | undefined
}): string {
    const aspectLabel = mapAspectRatioToCoverLabel(opts.aspectRatio)
    return BACK_COVER_PROMPT_TEMPLATE.replace('<ASPECT_RATIO>', aspectLabel)
}
