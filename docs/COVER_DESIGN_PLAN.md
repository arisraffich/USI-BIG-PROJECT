# Cover Design Feature — Implementation Plan (FINAL)

**Status:** Locked, ready for implementation
**Date:** 2026-03-05
**Default model:** GPT-2 (`gpt-image-2`)
**Orchestrator:** `gpt-5.4`

---

## 1. Goal

Add a lightweight **"Create Cover"** utility to every colored illustration card. Admin clicks the button on the illustration they want as style reference, fills in title + optional subtitle, generates → auto-downloads. No DB storage, no customer-side changes, no lock state.

Matches the **"Create LineArt"** pattern — same placement, same admin mental model.

---

## 2. Product Behavior

### 2.1 Button placement & visibility

- **Desktop:** `Create Cover` button on each colored illustration card, next to `Create LineArt` (top-left of the colored header).
- **Mobile:** small circular icon button (same style as Upload/Download) in the colored illustration's top-right overlay — placed **to the left of Upload/Download** icons. Uses the `BookImage` icon from lucide-react (closed book with image inside).
- Visible as soon as the illustration is generated (has a saved `illustration_url`). **No approval required.**
- Admin-only.
- Both placements open the same `CoverModal` with the same click flow.

### 2.2 Click flow

1. Admin clicks `Create Cover` on any colored illustration → opens the Cover modal.
2. Modal inputs:
   - **Title** (required, starts empty)
   - **Subtitle** (optional)
3. Hidden / under the hood:
   - Author name = `author_firstname + " " + author_lastname` from `projects`
   - Reference = the clicked illustration's URL
   - Aspect ratio label = mapped from `projects.illustration_aspect_ratio`
   - Image size = single-page size from existing `mapBookRatioToGpt2Size(..., isSpread=false)`
4. Buttons: `Cancel` / `Generate`.
5. `Generate`:
   - Modal stays open with spinner + status *"Generating cover…"*
   - Close blocked while generating; attempting to close shows `window.confirm('Generation is in progress. Cancel and close?')` (matches Line Art pattern).
6. On success:
   - Auto-downloads as `{SanitizedTitle}-cover.png` via blob URL + synthetic `<a>` click.
   - Success toast.
   - Modal closes.
7. On error:
   - Error message shown inside the modal.
   - `Try again` button retries with the same inputs.

### 2.3 No persistence

- No Supabase storage, no DB changes. No customer visibility. No regen history.
- If admin wants another version, they open the modal again.

---

## 3. Aspect Ratio Mapping (for prompt injection)

Mapped from `projects.illustration_aspect_ratio`:

| Book ratio | Prompt label | Pixel size (single) |
|---|---|---|
| `8:10` | `4:5 (portrait)` | `1664 × 2080` |
| `8.5:8.5` | `1:1 (square)` | `1904 × 1904` |
| `8.5:11` | `portrait, approximately 3:4` | `1632 × 2112` |

Pixel sizes reuse `mapBookRatioToGpt2Size(ratio, isSpread=false)` from `openai-illustration.ts`.

---

## 4. Generation Pipeline

### 4.1 Inputs assembled server-side

1. **Prompt** — `COVER_PROMPT_TEMPLATE` (§7) with substitutions:
   - `<ASPECT_RATIO>` → mapped label (see §3)
   - `<TITLE>` → admin input
   - `<SUBTITLE>` → admin input (if non-empty; otherwise the whole subtitle block line is **stripped** from the prompt)
   - `<AUTHOR>` → `author_firstname + " " + author_lastname`
2. **References (images)** — ONLY the selected colored illustration. No character refs.
3. **Size** — single-page size for the project's aspect ratio.

### 4.2 Model

- `gpt-image-2` via OpenAI Responses API, orchestrator `gpt-5.4`.
- Reuse existing `lib/ai/openai-illustration.ts` machinery.

### 4.3 Output

- PNG buffer returned directly from the API route as `Content-Type: image/png` with `Content-Disposition: attachment; filename="{sanitized-title}-cover.png"`.
- Client downloads via blob URL.
- No upload to Supabase, no DB update.

---

## 5. API Contract

### `POST /api/covers/generate`

**Admin-only** — gated by middleware AND a route-level `requireAdmin()` call (defense in depth).

**Request body:**
```
{
  projectId: string
  pageId: string          // the reference illustration's page
  title: string           // required
  subtitle?: string       // optional
}
```

**Server-side steps:**
1. `requireAdmin()` — route-level admin session check.
2. Fetch page by `pageId`:
   - Verify `page.project_id === projectId` (prevents cross-project leakage).
   - Verify `page.illustration_url` is set (otherwise 400).
3. Fetch project → author name + aspect ratio.
4. Fetch reference illustration bytes from the trusted `page.illustration_url`.
5. Assemble prompt (substitute, strip subtitle line if empty).
6. Call GPT-2 → PNG buffer.
7. Return PNG with download headers.

**Route config:** `export const maxDuration = 180`.

**On error:** JSON `{ error: string }` with appropriate status code. No binary body.

---

## 6. Files

### New

- `usi-platform/lib/ai/cover-prompt.ts` — `COVER_PROMPT_TEMPLATE` + aspect ratio label mapping helper.
- `usi-platform/lib/ai/cover-generator.ts` — `generateCover()` wrapping the GPT-2 call.
- `usi-platform/app/api/covers/generate/route.ts` — admin-only POST endpoint.
- `usi-platform/components/admin/CoverModal.tsx` — modal (title, subtitle, generate/cancel, progress, error, auto-download on success).

### Changed

- `usi-platform/components/illustration/SharedIllustrationBoard.tsx` — add `Create Cover` button next to `Create LineArt`; wire modal open with the illustration URL as ref.
- `usi-platform/docs/AI_ENGINES.md` — one-line mention of cover generation using `gpt-image-2`.

### Not changed

- No DB migrations.
- No customer-facing components.
- No send workflow or project settings changes.
- No lock state, progress counter, or "unlock when all approved" logic.

---

## 7. `COVER_PROMPT_TEMPLATE` (LOCKED)

```
TASK: CHILDREN'S BOOK FRONT COVER

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
- Print-ready: crisp, clean, professional.
```

When `<SUBTITLE>` is empty, strip the line `- Subtitle, only if provided: "<SUBTITLE>"` entirely from the prompt.

---

## 8. Implementation Phases

### Phase 1 — Backend
1. `cover-prompt.ts` (constant + aspect ratio label helper).
2. `cover-generator.ts` (GPT-2 call, subtitle stripping).
3. `/api/covers/generate` route (admin-gated, returns PNG bytes).

### Phase 2 — Frontend
1. `CoverModal.tsx` (inputs, progress, error, auto-download).
2. Wire `Create Cover` button into `SharedIllustrationBoard.tsx` next to `Create LineArt`.

### Phase 3 — Test & ship
1. Manual test on a real project.
2. Iterate on prompt if results need tuning.
3. Push.

---

## 9. Decisions Locked

- Per-illustration `Create Cover` button, next to `Create LineArt`.
- Visible when illustration is generated (no approval required).
- Modal inputs: title (required, empty by default) + subtitle (optional).
- Author auto-pulled from DB (`author_firstname + " " + author_lastname`).
- No character refs — the reference illustration is the sole visual input.
- Reference = the clicked illustration.
- Aspect ratio label injected dynamically (see §3).
- Model: GPT-2 (`gpt-image-2`), orchestrator `gpt-5.4`.
- Output: PNG, auto-download, filename `{SanitizedTitle}-cover.png`.
- No storage, no customer visibility, no DB changes.
- Progress shown in the modal; close blocked with a confirmation prompt during generation.
- Retry option on error.
- Prompt template in §7 is locked; if empty subtitle, the subtitle line is stripped entirely.
- API takes `pageId` (not raw URL). Server verifies ownership and fetches the trusted URL from DB.
- Route calls `requireAdmin()` directly, in addition to middleware protection.

---

## 10. Out of Scope (MVP)

- DB storage of cover.
- Customer-side visibility of cover.
- Send workflow integration.
- Project settings toggle (show/hide cover).
- Lock state / progress counter.
- Regen history.
- Multiple variants per generation.
- Header-level `Create Cover` button.
- Per-page ref picker modal.
- Back cover / spine / full wrap.
- DPI upscaling for print.
