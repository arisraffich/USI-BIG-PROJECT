# Cover Module — Implementation Plan (Admin-Only, Single Cover)

Status: **Locked, ready to build**
Supersedes: earlier draft of this file (customer-facing, multi-version) and `COVER_DESIGN_PLAN.md` (simple download utility, shipped in `e79558b6`).

This is the final plan. Every decision below has been explicitly agreed by Aris.

---

## 1. Scope

### In scope
- New **Cover** tab in admin project view (next to Pages / Characters / Illustrations).
- **One cover per project.** Enforced at the DB level.
- Cover has a **front** image and a **back** image. Both generated with GPT-2.
- Initial gen triggered from an illustration (current "Create Cover" button), flows into the Cover tab.
- **Separate Regenerate per side** (front / back) with its own modal.
- **Comparison view** scoped to the side being regenerated (OLD vs NEW picker).
- **Delete Cover** (full reset) with confirm dialog.
- **Download per side.** Single PNG download, no ZIP, no line-art.
- **Synchronous generation** — request stays open until the image is ready. Matches every other generation route in this codebase (`illustrations/generate`, `line-art/generate`, `characters/generate`).

### Out of scope (explicit)
- Customer-facing anything. No customer URL, no send endpoint, no email templates, no revision thread, no comments, no approve/reject.
- Multi-version / cover history / scrolling between versions.
- Remaster for covers.
- Inline editing of title/subtitle on the Cover tab (all edits go through the regen modal).
- Back cover blurb text / ISBN / barcode.
- Line-art ZIP bundle for covers.
- Any modification to `pages` table or existing illustration queries.

---

## 2. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Data model | New **`covers` table**, `UNIQUE(project_id)` |
| D2 | Sync vs async | **Sync** — request stays open until done. Matches every other generation route. Set `maxDuration = 180`. No polling, no background workers, no "generating" row in DB |
| D3 | Layout | Pure display on Cover tab: Back (left) + Front (right), headers with Regen + Download |
| D4 | Editing title/subtitle/reference | All editing lives **inside the regen modal**. Cover tab has no editable fields |
| D5 | Regen modal — 2 separate | Front modal: title, subtitle, reference page, instructions, add images. Back modal: instructions, add images only |
| D6 | Comparison view | Scoped to the side being regenerated. Other side stays as-is |
| D7 | Create Cover button visibility | Disappears from illustrations once a cover exists for the project |
| D8 | Empty state | Cover tab shows instruction: "Click 'Create Cover' on any colored illustration to generate your cover" |
| D9 | Delete | Destructive confirm dialog, wipes entire cover row |
| D10 | Storage | Existing `illustrations/` bucket, subfolder `covers/{projectId}/` |
| D11 | API | Single `/api/covers/regenerate` with `side: 'front' \| 'back'` |
| D12 | Regen modal for covers | Dedicated `CoverRegenModal` (simpler than parameterizing the illustration modal) |
| D13 | Back cover prompt | Simple v1 — front as reference, no text/blurb/ISBN. Better prompt later (v2) |

---

## 3. Data model

Since generation is sync, the row is only inserted **after** a successful image. No `'generating'` state is ever persisted. `'failed'` is kept for *future-proofing* (e.g., if we later retry without blocking the UI), but in v1 a failed request returns an error to the client and writes nothing to the DB.

```sql
CREATE TABLE covers (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid          UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  title           text          NOT NULL,
  subtitle        text,
  source_page_id  uuid          REFERENCES pages(id) ON DELETE SET NULL,

  front_url       text,                                              -- null until first successful front gen
  back_url        text,                                              -- null until first successful back gen
  front_status    text          NOT NULL DEFAULT 'pending',          -- 'pending' | 'completed' | 'failed'
  back_status     text          NOT NULL DEFAULT 'pending',

  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

-- updated_at auto-touch trigger (same pattern as other tables in the codebase)
CREATE TRIGGER covers_updated_at
  BEFORE UPDATE ON covers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');
```

Note: no `front_error` / `back_error` columns in v1 — sync errors are returned to the client directly, no need to persist.

### TS type (`types/cover.ts`, new)
```typescript
// 'generating' kept in the union for future-proofing; never written in v1
export type CoverStatus = 'pending' | 'generating' | 'completed' | 'failed'

export interface Cover {
  id: string
  project_id: string
  title: string
  subtitle: string | null
  source_page_id: string | null
  front_url: string | null
  back_url: string | null
  front_status: CoverStatus
  back_status: CoverStatus
  created_at: string
  updated_at: string
}
```

---

## 4. API

All routes admin-gated via `requireAdmin()`.

All routes use `export const maxDuration = 180` (same as `/api/illustrations/generate`).

### 4.1 `POST /api/covers/generate` — **initial** cover generation
Replaces the current simple PNG-return endpoint (the shipped download utility). Sync: request stays open ~60–120s.

Request:
```json
{
  "projectId": "uuid",
  "sourcePageId": "uuid",
  "title": "string",
  "subtitle": "string?"
}
```

Server:
1. `requireAdmin()`.
2. Verify project + sourcePage, fetch author + aspect ratio. Confirm `sourcePage.illustration_url` exists.
3. Check `UNIQUE(project_id)` — if a cover already exists, return 409 (admin must Delete first).
4. Call `generateCover()` (GPT-2, awaited). On failure: return 500 with message, **no row inserted**.
5. Upload image to `illustrations/covers/{projectId}/front-{timestamp}.png`.
6. `INSERT` cover row with `front_url`, `front_status='completed'`, `back_status='pending'`.
7. Return the full `Cover` object.

Response:
```json
{ "cover": { ...Cover } }
```

### 4.2 `POST /api/covers/regenerate`
One endpoint for both front and back, with `side` discriminator. Sync.

Request (front):
```json
{
  "coverId": "uuid",
  "side": "front",
  "title": "string",
  "subtitle": "string?",
  "sourcePageId": "uuid",
  "instructions": "string?",
  "addedImages": ["data:image/...base64..."]
}
```

Request (back):
```json
{
  "coverId": "uuid",
  "side": "back",
  "instructions": "string?",
  "addedImages": ["data:image/...base64..."]
}
```

Server:
1. `requireAdmin()`.
2. Verify cover + project ownership.
3. **Back-only precondition:** return 400 if `front_url` is null ("generate front cover first").
4. Call `generateCover()` (front) or `generateBackCover()` (back), awaited.
   - Front uses: `sourcePage.illustration_url` + `addedImages` + new title/subtitle + instructions.
   - Back uses: current `front_url` + `addedImages` + instructions.
5. On failure: return 500 with message, **row unchanged**.
6. Upload to `illustrations/covers/{projectId}/{side}-{timestamp}.png`.
7. Update row:
   - Front: `front_url`, `title`, `subtitle`, `source_page_id`, `front_status='completed'`.
   - Back: `back_url`, `back_status='completed'`.
8. Return `{ cover, newUrl, oldUrl }` — client uses `oldUrl` + `newUrl` to drive the comparison view.

Response:
```json
{ "cover": { ...Cover }, "newUrl": "https://...", "oldUrl": "https://..." | null }
```

### 4.3 `POST /api/covers/revert`
Rollback helper for comparison-view "Keep OLD" action.

Request:
```json
{
  "coverId": "uuid",
  "side": "front" | "back",
  "url": "previously-saved-url"
}
```

Server:
1. `requireAdmin()`.
2. Verify cover ownership.
3. Validate that `url` starts with the expected storage prefix for this project (`illustrations/covers/{projectId}/`) — prevents admin from smuggling arbitrary URLs into the row.
4. Update `{side}_url = url`. Return updated `Cover`.

**Note:** we only ever store the *current* URL. The OLD URL lives in component state during comparison. If admin refreshes the page mid-comparison, OLD is lost and NEW becomes canonical — acceptable, matches illustration behavior.

### 4.4 `GET /api/projects/[id]/cover`
Returns `{ cover: Cover | null }`. No 404 when empty — return `null` so the client can render the empty state without an error branch.

### 4.5 `DELETE /api/covers/[coverId]`
Full wipe. Deletes row + best-effort deletion of storage files under `illustrations/covers/{projectId}/`. Admin confirms via client dialog before hitting this.

---

## 5. Prompts

### 5.1 Front cover prompt
Already exists: `lib/ai/cover-prompt.ts` (`buildCoverPrompt()`). Reused unchanged.

### 5.2 Back cover prompt (new)
Added to `lib/ai/cover-prompt.ts` as `buildBackCoverPrompt()`. Simple v1:

```
TASK: CHILDREN'S BOOK BACK COVER

You are a professional graphic designer. Given ONE reference illustration which is the FRONT COVER of the book, design a matching BACK COVER.

STYLE:
- Match the reference front cover exactly: same medium, linework, palette, shading, lighting, and mood.
- The back cover must feel like a natural continuation of the same book.

ASPECT RATIO:
- Output aspect ratio: <ASPECT_RATIO>.
- Do not stretch, squeeze, distort, or letterbox.

COMPOSITION:
- Design a complementary back cover — do NOT copy the front.
- Use the world, environment, and style from the front cover.
- Do NOT repeat the main characters unless naturally fitting (e.g., a silhouette, an object they own).
- Keep the composition simple and uncluttered.

CONSTRAINTS:
- No text of any kind. No title, no blurb, no author line, no barcode, no ISBN. Do not render any letters, numbers, or symbols.
- No 3D effects, bevels, photographic filters, or stock shadows.
- No decorative border or frame.
- No book mockup, spine, 3D product render.
- Print-ready: crisp, clean, professional.
```

`<ASPECT_RATIO>` is injected using the existing `mapAspectRatioToCoverLabel()` helper.

### 5.3 `generateBackCover()` function
Added to `lib/ai/cover-generator.ts`. Same structure as `generateCover()` but:
- `content` only includes `front_url` as reference.
- Uses `buildBackCoverPrompt()`.
- Size mapping is the same `mapBookRatioToCoverSize()`.

---

## 6. Frontend

### 6.1 New files

| File | Purpose |
|---|---|
| `types/cover.ts` | `Cover`, `CoverStatus` interfaces |
| `app/admin/project/[id]/cover/page.tsx` *or* add to existing tabs content | Cover tab route |
| `components/cover/CoverTabContent.tsx` | Top-level: fetches cover once on mount, renders empty state or `CoverBoard`, holds the `Cover` in state and updates it after regen responses |
| `components/cover/CoverBoard.tsx` | Dual-image display: back (left) + front (right) + delete button + per-side headers |
| `components/cover/CoverSidePane.tsx` | One image pane (used for both back and front). Handles: image display, loading overlay, empty state "Create Back Cover" button (back only), Regen button, Download button, per-side comparison view during regen |
| `components/cover/CoverFrontRegenModal.tsx` | Front regen modal: title + subtitle + reference page + instructions + add images |
| `components/cover/CoverBackRegenModal.tsx` | Back regen modal: instructions + add images |
| `components/cover/CoverDeleteConfirm.tsx` | Small confirm dialog for delete |
| `lib/ai/cover-generator.ts` | Extend with `generateBackCover()` |
| `lib/ai/cover-prompt.ts` | Extend with `buildBackCoverPrompt()` |

### 6.2 Modified files

| File | Change |
|---|---|
| `components/illustration/SharedIllustrationBoard.tsx` | Hide `Create Cover` button when project already has a cover. Needs `hasCover: boolean` prop from parent |
| `components/illustration/CoverModal.tsx` | Strip line-art checkbox + ZIP download logic. On submit: await `/api/covers/generate` (shows loading for ~60–120s inside the modal), close, router.push to Cover tab |
| `components/admin/ProjectTabsContent.tsx` (or wherever tabs are declared) | Add `Cover` tab entry and route wiring |
| `types/cover.ts` | Add `hasCover` flag to project context (or the parent component fetches cover once and passes down) |

### 6.3 Layout spec

**Cover tab (filled state):**
```
┌────────────────────────────────────────────────────────┐
│                                            [Delete]    │
├────────────────────────────────────────────────────────┤
│ BACK COVER  [Regen][Download] │ FRONT COVER  [Regen][Download] │
├───────────────────────────────┼────────────────────────┤
│                               │                        │
│       BACK COVER IMAGE        │    FRONT COVER IMAGE   │
│                               │                        │
└───────────────────────────────┴────────────────────────┘
```

**Back side when `back_url` is null and `back_status === 'pending'`:**
```
┌───────────────────────────────┐
│ BACK COVER                    │
├───────────────────────────────┤
│                               │
│  [Create Back Cover]          │  ← centered button
│                               │
│  Uses the current front       │
│  cover as reference           │
│                               │
└───────────────────────────────┘
```

**Comparison view during front regen** (back stays normal):
```
┌────────────────────────────────────────────────────────────────────────┐
│                                                            [Delete]    │
├────────────────────────────────────────────────────────────────────────┤
│ BACK COVER │ FRONT: OLD [Keep OLD]      │ FRONT: NEW [Keep NEW]         │
├────────────┼─────────────────────────────┼───────────────────────────────┤
│            │                             │                               │
│ BACK IMAGE │      OLD FRONT              │       NEW FRONT               │
│            │                             │                               │
└────────────┴─────────────────────────────┴───────────────────────────────┘
```

Same pattern reversed when regenerating back.

**Cover tab (empty state):**
```
┌────────────────────────────────────────────────────────┐
│                                                        │
│                  [BookImage icon]                      │
│                                                        │
│       Click "Create Cover" on any colored              │
│       illustration to generate your cover.             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 6.4 Loading states (no polling)

Because every generation is sync, there's no polling anywhere. Two loading UIs:

- **Initial gen**: the `CoverModal` on the Illustrations tab stays open with a spinner + text "Generating cover... (~60–120s)" while awaiting `/api/covers/generate`. On success → close modal → `router.push(?tab=cover)`. On error → inline error inside the modal, admin can retry without closing.
- **Regen**: the regen modal closes immediately on submit. The Cover tab shows a **loading overlay on the side being regenerated** (spinner + "Regenerating front cover..."). The other side stays static. When the awaited response returns, overlay disappears and comparison view renders.

### 6.5 Regen flow — client side (sync)

**Front regen:**
1. Admin clicks Regen in front header.
2. `CoverFrontRegenModal` opens, pre-filled from current `Cover` state (title, subtitle, source_page_id).
3. Admin tweaks fields, clicks Regenerate.
4. Modal closes. Parent sets `frontRegenerating = true` → front pane shows loading overlay.
5. `await fetch('/api/covers/regenerate', { side: 'front', ... })`.
6. On response: parent updates `Cover` state with returned `cover`, enters comparison mode using `oldUrl` + `newUrl` from the response.
7. Admin clicks **Keep NEW**: exit comparison mode, done.
8. Admin clicks **Keep OLD**: `await fetch('/api/covers/revert', { side: 'front', url: oldUrl })`, update `Cover` state, exit comparison mode.
9. On regen error: overlay disappears, toast shows error, `Cover` unchanged.

Back regen follows the identical pattern with `side: 'back'`.

### 6.6 Initial gen entry points

**Primary:** existing `Create Cover` button on each colored illustration in the Illustrations tab.
- Hidden when a cover already exists (parent passes `hasCover: boolean` prop, determined by a single GET to `/api/projects/[id]/cover` at tab-load time).
- Opens simplified `CoverModal` (strip the line-art checkbox and all ZIP/download logic).
- Submit → `await /api/covers/generate` (modal stays open with spinner) → on success, `router.push('?tab=cover')`.

**No secondary entry point on the Cover tab** — empty state just tells admin to go to illustrations. Keeps it simple.

---

## 7. Phase order

| Phase | Scope | Time |
|---|---|---|
| P1 | Migration + TS types + `generateBackCover()` + `buildBackCoverPrompt()` | 0.25 day |
| P2 | Async `/api/covers/generate` + GET + DELETE + empty state + Cover tab shell + updated initial modal + redirect flow + polling | 1 day |
| P3 | Front side rendering with image + Regen modal + Regen API + comparison view + revert | 1 day |
| P4 | Back side rendering + "Create Back Cover" button + Back regen modal + comparison view for back | 0.5 day |
| P5 | Hide `Create Cover` button when cover exists + mobile responsive pass + download polish | 0.25 day |

**Total: ~3 days.**

Checkpoints at the end of each phase — I'll pause, tell you the project URL to sanity-check, and only proceed when you're happy.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Admin regenerates before first gen completes | Low | Low | Regen button disabled while `{side}_status === 'generating'` |
| Admin refreshes mid-comparison, loses OLD URL | Medium | Low | NEW becomes canonical; matches illustration behavior. Toast notice when entering comparison: "Don't refresh — OLD version won't be recoverable." |
| Storage path collision on regen | Low | Low | Filename includes timestamp: `front-{timestamp}.png` |
| Source page deleted after cover created | Low | Low | `ON DELETE SET NULL` on `source_page_id` — cover keeps working, regen shows warning "source page no longer exists, please pick another" |
| Delete doesn't clean up storage files | Low | Low | Best-effort delete; if it fails, orphaned file in storage is harmless. Log warning |
| Back cover generated before front exists | Low | Low | "Create Back Cover" button disabled until `front_status === 'completed'` |

---

## 9. Open items (non-blocking — addressed during build)

- Exact storage cleanup strategy on DELETE (best-effort vs. listed deletion).
- Back cover error display UI (inline toast vs error state on the pane).
- Mobile layout of side-by-side back/front (stack vertically on narrow screens).

---

## 10. Ready to start

- [ ] Migration SQL (§3) reviewed.
- [ ] API surface (§4) reviewed.
- [ ] Back cover prompt v1 (§5.2) reviewed.
- [ ] Layout (§6.3) matches your mental model.
- [ ] Phase order (§7) ok.

If all yes → P1 begins.
