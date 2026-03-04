# US Illustrations Platform

A full-stack platform for managing children's book illustration projects. Handles the complete workflow from manuscript upload through AI-powered character generation, illustration creation, customer review, and final delivery with line art conversion.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (strict, `unknown` catch blocks)
- **Database:** Supabase (PostgreSQL) with `pg_cron` + `pg_net` extensions
- **Storage:** Supabase Storage (illustrations, sketches, character images, line art) + Cloudflare R2 (temporary line art ZIPs)
- **AI Generation:**
  - OpenAI GPT-5.2 (story analysis, character identification, scene descriptions)
  - Google Gemini 3.1 Flash Image Preview "Nano Banana 2" (image generation: characters, illustrations, sketches, line art)
  - Thinking mode: HIGH for initial generation, optional toggle for regeneration
- **Image Processing:** Potrace (vectorization) + Sharp (PNG rendering)
- **Email:** Resend (with R2 download links for large attachments >40MB)
- **Notifications:** Slack Webhooks, SMS (Quo.com)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Deployment:** Railway (auto-deploy from GitHub)

## Features

### Admin Side
- **Project Creation:** Upload manuscript (PDF/DOCX/TXT), AI analyzes and splits into pages
- **Character Management:** AI identifies characters from story, generates images from descriptions
- **Illustration Generation:** AI creates colored illustrations for each page with character consistency
- **Sketch Generation:** Automatic B&W sketch conversion for customer preview
- **Line Art Generation:** AI-powered line art + Potrace vectorization for production-ready transparent PNGs (admin-only)
- **Regeneration with Comparison:** Side-by-side old vs new comparison before committing changes
- **Deep Thinking Toggle:** Optional "heavy thinking" mode for regeneration (characters + illustrations)
- **Batch Generation:** Generate all remaining illustrations in parallel (3 concurrent)
- **Bulk Downloads:** ZIP download of sketches + illustrations, or line art + illustrations
- **Email Delivery:** Send ZIP packages to info@usillustrations.com (large files auto-upload to R2 with download link)
- **Scheduled Sends:** Schedule character/sketch sends for a specific hour and day (up to 7 days ahead), with pg_cron executing at the scheduled time
- **Push Updates:** Silently sync changes to customer without notifications
- **Page Management:** Delete pages with automatic renumbering, storage cleanup, and story text clipboard copy
- **Sketch/Story Toggle:** View sketch or story text per card, with "This page" / "All pages" scope selector
- **Settings Panel:** Toggle colored image visibility, request coloring, manage downloads

### Customer Side
- **Review Portal:** Token-based access (no login required)
- **Character Forms:** Sequential form-filling with progress tracking
- **Illustration Review:** View sketches (and optionally colored), request revisions with notes
- **Conversation Threads:** Back-and-forth feedback between admin and customer per page
- **Revision History:** Track all feedback rounds with visual badges and collapsible history
- **One-Click Approval:** Approve all sketches to proceed to production

### Notifications
- Slack notifications for all project events (character submissions, approvals, feedback)
- Email notifications via Resend (review links, approval confirmations, ZIP delivery)
- SMS support via Quo.com (optional, customer notifications)

## Project Workflow

```
1. Project Creation
   └─> Upload manuscript (PDF/DOCX/TXT)
   └─> AI analyzes story, identifies characters, splits into pages
   └─> Admin can delete/renumber pages as needed

2. Character Stage
   └─> Admin sends character forms to customer (immediately or scheduled)
   └─> Customer fills out character details (age, hair, clothing, etc.)
   └─> AI generates character images using form data
   └─> Customer reviews and approves (or requests revisions)

3. Illustration Stage
   └─> Admin generates Page 1 illustration first
   └─> Remaining pages unlock for batch generation
   └─> AI creates colored illustrations + B&W sketches for each page
   └─> Admin sends sketches to customer for review (immediately or scheduled)

4. Review Stage
   └─> Customer reviews each page's sketch
   └─> Can request revisions with notes (per-page feedback)
   └─> Admin replies, regenerates as needed (with optional deep thinking)
   └─> Conversation threads for back-and-forth discussion

5. Approval & Delivery
   └─> Customer approves all sketches
   └─> Admin can download sketches + illustrations as ZIP
   └─> Admin can generate line art (AI + Potrace vectorization → transparent PNGs)
   └─> Admin can download or email line art + illustrations as ZIP
   └─> Email delivery to info@usillustrations.com (R2 links for large files)
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Supabase project (with Storage buckets)
- OpenAI API key
- Google AI API key (Gemini 3 Pro)
- Resend account (for emails)
- Slack webhook (for notifications, optional)

### Environment Variables

Create a `.env.local` file with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# AI Services
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...

# Admin Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Email (Resend)
RESEND_API_KEY=re_...

# Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# SMS (optional)
QUO_API_KEY=...
QUO_PHONE_NUMBER=...

# Scheduled Sends (pg_cron authentication)
CRON_SECRET=your-cron-secret

# Cloudflare R2 (for large email attachments)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=https://your-r2-domain.com

# Direct DB access - for migration scripts only (optional)
DATABASE_URL=postgresql://...
```

**Note:** The app validates required env vars on startup. If any are missing, you'll see a clear error message listing which ones are needed.

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the app.

### Admin Access

Navigate to `/admin` and login with your `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

### Customer Access

Customers receive a unique review link: `/review/[token]`

## Deployment

The app is deployed on Railway with auto-deploy from GitHub:

```bash
# Build
npm run build

# Start (Railway uses this, binds to 0.0.0.0 with PORT env var)
npm start
```

## Project Structure

```
usi-platform/
├── app/
│   ├── admin/                # Admin dashboard and project management
│   ├── api/
│   │   ├── ai/              # AI character identification
│   │   ├── auth/            # Admin login/logout
│   │   ├── characters/      # Character CRUD, generation, sketch upload
│   │   ├── email/           # Email delivery (send-sketches, send-lineart)
│   │   ├── illustrations/   # Illustration generation, confirmation
│   │   ├── line-art/        # Line art generation and status
│   │   ├── pages/           # Page CRUD, feedback, admin replies, delete with renumber
│   │   ├── projects/        # Project CRUD, settings, downloads, send-to-customer
│   │   ├── review/          # Customer review endpoints (token-based)
│   │   └── scheduled-sends/ # Scheduled send management + pg_cron execution endpoint
│   ├── login/               # Admin login page
│   └── review/              # Customer review portal
├── components/
│   ├── admin/               # Admin-specific (ProjectHeader, IllustrationsTab, etc.)
│   ├── illustration/        # Shared illustration board, feed, sidebar
│   ├── layout/              # Header shells, project layout
│   ├── project/             # Manuscript editor, page cards, character cards
│   ├── review/              # Customer-facing components
│   ├── shared/              # Shared utilities (RichTextEditor, UniversalCharacterCard)
│   └── ui/                  # shadcn/ui components
├── lib/
│   ├── ai/                  # AI integrations (OpenAI, Google Gemini, character/sketch gen)
│   ├── constants/           # Status configs, badge colors
│   ├── line-art/            # Potrace processor + Supabase storage
│   ├── notifications/       # Email (Resend), Slack, SMS orchestration
│   ├── services/            # Feedback service
│   ├── supabase/            # Database clients (server + browser)
│   └── utils/               # Error handling, file parsing, prompts, metadata
├── hooks/                   # Custom React hooks (project status, illustration lock)
├── types/                   # TypeScript types (Project, Page, Character, etc.)
├── scripts/                 # Migration scripts
├── supabase/
│   └── migrations/          # Database migrations (SQL)
├── instrumentation.ts       # Env validation on startup
└── next.config.ts           # Next.js config (Potrace external, image domains)
```

## Key Components

- **SharedIllustrationBoard:** Core component for displaying illustrations with sketch/story text toggle (with "This page"/"All pages" scope), colored toggle, feedback, adaptive text layout, and line art generation
- **ProjectHeader:** Admin project header with stage management, bulk downloads, line art modal, email delivery, scheduled sends (split button with schedule popover, scheduled/failed states), and settings
- **IllustrationsTabContent:** Admin illustration management with comparison mode, batch generation, and global sketch view mode propagation
- **UnifiedIllustrationFeed:** Feed wrapper that bridges IllustrationsTabContent and SharedIllustrationBoard, forwarding global view mode and toggle callbacks
- **CustomerProjectTabsContent:** Main customer review interface with character forms and illustration feedback
- **UnifiedCharacterCard:** Reusable character card for admin (with regeneration, deep thinking toggle) and customer views

## Database Schema

Main tables:
- `projects` - Project metadata, status, send counts, settings
- `pages` - Manuscript pages with story text, illustrations, sketches, feedback history
- `characters` - Character definitions, generated images, form data
- `scheduled_sends` - Scheduled send jobs (project_id, action_type, scheduled_at, status, error_message)

Database extensions:
- `pg_cron` - Runs every minute to check for due scheduled sends
- `pg_net` - Makes HTTP calls from Postgres to the execute endpoint

Storage buckets:
- `character-images` - Generated character illustrations
- `character-sketches` - Character sketch images
- `illustrations` - Page illustrations and sketches
- `lineart` - Generated line art PNGs (per project)
- `project-files` - Uploaded manuscripts

See `/supabase/migrations/` for full schema.

## Line Art Pipeline

The line art feature (admin-only) converts colored illustrations into production-ready transparent PNG line art:

1. **AI Generation:** Google Gemini 3 Pro converts the colored illustration into clean line art
2. **Vectorization:** Potrace traces the raster output into an SVG vector
3. **PNG Rendering:** Sharp renders the SVG to a 2048x2048 transparent PNG
4. **Storage:** Uploaded to Supabase Storage (`lineart` bucket)

Single pages can be generated individually via the "Create LineArt" button, or all pages can be batch-processed via "Download Line Art" in settings (with progress modal, retry for failures, and auto-ZIP download).

## Scheduled Sends

The platform supports scheduling sends for a future time instead of sending immediately. Every send/resend button is a split button:

- **Main area:** Sends immediately (same as before)
- **▾ dropdown:** Opens a schedule popover with hour (00–23) and day (Today, After 1–7 days) pickers

### Architecture

1. Admin picks a time → local time converted to UTC → stored in `scheduled_sends` table
2. Supabase `pg_cron` runs every minute → calls `pg_net` to POST to `/api/scheduled-sends/execute`
3. Execute endpoint (authenticated via `CRON_SECRET`) finds due sends → calls the existing send-to-customer API
4. Send marked as `completed` or `failed` with error message

### Button States

- **Normal:** `[Send Sketches ▾]` — split button
- **Scheduled:** `[🕐 Mar 6, 14:00 ✕]` — shows scheduled time with cancel
- **Failed:** `[⚠️ Send Failed — Retry ▾]` — click to retry immediately, ▾ to reschedule

## License

Private - US Illustrations LLC
