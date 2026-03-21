# CLAUDE.md — AI Assistant Context for USI Platform

## What This Is

Full-stack children's book illustration management platform. Manages the entire workflow: manuscript upload → AI character generation → illustration generation → customer review → line art production → delivery. Built for US Illustrations LLC.

**Live URL:** https://studio.usillustrations.com
**Repo:** arisraffich/USI-BIG-PROJECT (auto-deploys to Railway on push to main)

## Tech Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** (strict, `unknown` catch blocks)
- **Supabase** (PostgreSQL + Storage + Realtime) with `pg_cron` + `pg_net` extensions
- **AI:** OpenAI GPT-5.2 (text analysis) + Google Gemini 3.1 Flash Image Preview (all image generation, with thinking mode)
- **Cloudflare R2** for temporary large file hosting (email attachments >40MB)
- **Resend** (email), **Slack** (webhooks), **Quo.com** (SMS)
- **Potrace** (vectorization) + **Sharp** (PNG rendering) for line art pipeline
- **Tailwind CSS v4** + **shadcn/ui** + **Radix UI** primitives
- **Railway** deployment (auto-deploy from GitHub main branch)

## Project Structure

```
usi-platform/
├── app/api/             # All API routes (see section below)
├── components/
│   ├── admin/           # ProjectHeader, IllustrationsTabContent, CharactersTabContent
│   ├── illustration/    # SharedIllustrationBoard, UnifiedIllustrationFeed
│   ├── project/         # ManuscriptEditor, page/character cards
│   ├── review/          # Customer-facing review components
│   ├── shared/          # UniversalCharacterCard, SendConfirmationDialog
│   └── ui/              # shadcn/ui primitives
├── lib/
│   ├── ai/              # AI integrations (OpenAI, Gemini, director, generators)
│   ├── notifications/   # Email, Slack, SMS dispatch (best-effort, never throws)
│   ├── line-art/        # Potrace processor + storage
│   ├── supabase/        # DB clients (server + browser)
│   └── utils/           # Error handling, file parsing, prompts
├── hooks/               # useProjectStatus, useIllustrationLock, useReferencePhoto
├── types/               # Project, Page, Character, Feedback types
├── docs/                # All documentation (setup, specs, guides)
└── supabase/migrations/ # SQL migration files
```

## API Routes (`app/api/`)

| Route | Purpose |
|-------|---------|
| `ai/` | Character identification from story text |
| `auth/` | Admin login/logout (cookie session) |
| `characters/` | CRUD, generate, suggest, confirm, upload, sketch generation |
| `email/` | Send sketches/lineart ZIPs via Resend |
| `illustrations/` | Generate, confirm, upload, configure, reset |
| `line-art/` | Generate line art, status check |
| `pages/` | CRUD, delete with renumber, resolve feedback, admin reply |
| `projects/` | CRUD, send-to-customer, push updates, settings, downloads, style refs |
| `review/` | Customer token-based: approve, submit, feedback, follow-up |
| `scheduled-sends/` | Create/cancel scheduled sends + `execute/` endpoint for pg_cron |
| `submit/` | Customer submission wizard |

## Key Components

### `ProjectHeader.tsx` (admin)
Main project action bar. Contains the **split send button** pattern:
- Primary click = send immediately
- `▾` dropdown = schedule popover (hour 00-23, day Today/+1-7)
- Three states: **normal** (split button), **scheduled** (shows time + cancel ✕), **failed** (retry + reschedule)
- State vars: `scheduledSend`, `schedulePopoverOpen`, `scheduleHour`, `scheduleDays`, `lastFailedSend`
- Uses custom click-outside ref pattern (not Radix Popover — see Gotchas)

### `SharedIllustrationBoard.tsx` (illustration)
Core illustration display component (~2000+ lines). Handles:
- Sketch/Story text toggle with **"This page"/"All pages"** admin-only scope selector
- Custom popover using `relative`/`absolute` divs (not Radix — see Gotchas)
- Dual refs: `sketchPopoverDesktopRef` + `sketchPopoverMobileRef` for click-outside detection
- Adaptive text layout: story text (`shrink-0`) + scene description (`flex-1`) share vertical space
- Key state: `sketchViewMode`, `sketchTogglePopoverOpen`, `pendingSketchModeRef`
- Receives `globalSketchViewMode` and `onToggleAllSketchView` from parent via `UnifiedIllustrationFeed`

### `IllustrationsTabContent.tsx` (admin)
Manages `globalSketchViewMode` state, passes it down through `UnifiedIllustrationFeed` → `SharedIllustrationBoard`.

### `UnifiedCharacterCard.tsx` (shared)
Reusable for admin (with regeneration + deep thinking toggle) and customer views.

## Database

### Tables
- `projects` — metadata, status, send counts, settings
- `pages` — story text, illustrations, sketches, feedback history
- `characters` — definitions, generated images, form data
- `scheduled_sends` — project_id, action_type, scheduled_at, status, error_message

### Extensions
- `pg_cron` — runs every minute, calls `/api/scheduled-sends/execute` via `pg_net`
- `pg_net` — HTTP calls from Postgres (authenticated with `CRON_SECRET`)

### Storage Buckets
`character-images`, `character-sketches`, `illustrations`, `lineart`, `project-files`

## Scheduled Sends System

1. Admin picks hour + day → local time converted to UTC → stored in `scheduled_sends`
2. `pg_cron` fires every minute → `pg_net` POSTs to `/api/scheduled-sends/execute` with Bearer `CRON_SECRET`
3. Execute endpoint finds due sends → calls `/api/projects/{id}/send-to-customer`
4. Always sends **latest** content (not the version at schedule time)
5. Scheduling does NOT change project status — status changes when send executes

## Notification Pattern

All `notify*` functions in `lib/notifications/index.ts`:
- Call `sendEmail` (Resend) + `sendSlackNotification` (webhook) + optionally SMS
- **Best-effort**: errors are logged, never thrown, never block workflows
- Email templates in `lib/email/renderer`

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `CRON_SECRET`

**Optional:** `NEXT_PUBLIC_BASE_URL`, `SLACK_WEBHOOK_URL`, `QUO_API_KEY`, `QUO_PHONE_NUMBER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `DATABASE_URL`

Validated on startup via `instrumentation.ts` → `lib/env.ts`.

## Coding Conventions

- TypeScript strict mode with `unknown` in catch blocks
- Tailwind CSS v4 for all styling (no CSS modules)
- shadcn/ui components in `components/ui/`
- `sonner` for toast notifications
- `createAdminClient()` from `lib/supabase/server` for server-side DB access
- API routes return `NextResponse.json()` with appropriate status codes
- Custom hooks prefixed with `use` in `hooks/` directory
- No dark mode (light only)

## Known Gotchas

### Radix Popover + Interactive Children
Radix `PopoverTrigger asChild` intercepts click events on nested interactive elements (buttons, switches). **Solution:** Use custom `relative`/`absolute` div popovers with manual click-outside `useEffect` instead of Radix Popover when the trigger contains interactive elements.

### Dual Refs for Desktop/Mobile
When the same popover renders in both desktop and mobile layouts (responsive), a single ref gets overwritten by the last render. **Solution:** Use separate refs (`desktopRef` + `mobileRef`) and check both in the click-outside handler.

### `const` Hoisting
Callbacks defined before a `const` variable they reference will throw "can't access lexical declaration before initialization." **Solution:** Always place callbacks after the variables they depend on.

### Large Email Attachments
ZIPs >40MB fail with Resend. **Solution:** Upload to Cloudflare R2, send download link in email instead.

### Page Deletion
Deleting a page requires renumbering all subsequent pages and cleaning up Storage files (illustrations, sketches, line art). The `/api/pages/[id]` DELETE endpoint handles this atomically.

## Deploy

```bash
git add . && git commit -m "message" && git push  # Railway auto-deploys from main
```

## Documentation

All docs live in `docs/`:
- `README.md` — Full project overview, features, setup, structure
- `About USI Platform.md` — Detailed platform description and architecture
- `SETUP.md` — Environment setup guide with env var table
- `NOTIFICATION_SETUP.md` — Email, Slack, SMS configuration
- `SLACK_SETUP_GUIDE.md` — Step-by-step Slack webhook setup
- `00 FINAL CONFIRMED SPECS.md` — Historical original spec (outdated, kept for reference)
