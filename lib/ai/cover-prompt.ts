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
