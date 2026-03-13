# About USI Platform

USI Platform is an end-to-end project management and AI-powered illustration production system built for children's book studios. It orchestrates the entire journey from a raw manuscript to production-ready artwork — combining AI image generation with sophisticated character consistency, a structured client review process, multi-channel communication, and automated delivery workflows.

---

## The Problem It Solves

Producing illustrations for a children's book involves dozens of moving parts: understanding the story, designing consistent characters, generating illustrations page by page, collecting client feedback, managing revision rounds, and delivering final production files. Traditionally, this is managed through scattered emails, file-sharing links, and manual coordination. USI Platform replaces all of that with a single, intelligent system.

---

## AI-Powered Illustration Engine

At the core of the platform is an AI illustration pipeline that generates colored illustrations, black-and-white sketches, and production-ready line art — all while maintaining visual consistency across every page of a book.

### Character Consistency

The platform achieves near-perfect character consistency across pages using an interleaved text-image prompting technique. When generating any illustration, every character's reference image is fed directly to the AI alongside detailed text descriptions of their appearance, role, and actions. The main character receives special treatment — their image serves as the master style anchor, meaning the AI extracts not just the character's appearance but the entire artistic style (medium, texture, flatness, color palette) and applies it uniformly to backgrounds, props, trees, and every element in the scene. This prevents the common problem of characters looking consistent while environments drift between pages.

### Page-to-Page Environment Consistency

For pages 2 and beyond, the system automatically uses Page 1's completed illustration as an anchor image, processed at high quality (2048px, 95% JPEG) to prevent quality degradation across the chain. This ensures that the artistic style, lighting, and rendering remain cohesive throughout the entire book — not just for characters, but for everything in the scene.

### Style Reference System

The platform supports three tiers of style control:

- **Main character as style anchor** — the default mode, where the main character's image defines the visual language for the entire book
- **Custom project-level style references** — up to 3 uploaded reference images for sequels or specific artistic directions, which override the main character as the style source
- **Page-to-page anchoring** — automatic consistency propagation from page to page using previously generated illustrations

### Multi-Model Character Generation

The platform supports multiple AI image generation engines for character creation, selectable from a dropdown in the regeneration dialog:

- **NB2** (Nano Banana 2 — Gemini 3.1 Flash Image Preview) — the default engine, optimized for speed and volume with controllable thinking mode
- **NB Pro** (Nano Banana Pro — Gemini 3 Pro Image Preview) — higher quality engine with always-on advanced reasoning ("thinking") for complex prompts
- **GPT** (GPT Image 1.5 via OpenAI Responses API) — alternative engine with different artistic characteristics

All engines share the same orchestration pipeline: reference images are fetched once as raw buffers, the prompt is built once, and post-generation tasks (upload, database update, cleanup) are handled identically. The modular engine architecture (`lib/ai/engines/`) makes it trivial to add or remove models — each engine is a single function conforming to a shared interface.

### Regeneration with Full Creative Control

When an illustration needs changes, the admin has two powerful regeneration modes:

- **Edit Mode** — provide custom text instructions and up to 5 reference images (uploaded, dragged-and-dropped, or pasted from clipboard) to guide targeted changes
- **Scene Recreation Mode** — select any previous page's environment as a background, then choose which characters appear, customize each character's action and emotion individually, and regenerate with the background preserved but characters completely recomposed

Before any regeneration replaces an existing illustration, the system enters a comparison mode — showing the old and new versions side-by-side. The admin explicitly chooses to keep the new version or revert to the old one. A backup of the original is automatically downloaded before any change is committed.

### Batch Generation

After the first page is illustrated, all remaining pages unlock for batch generation with up to 3 pages processing concurrently, with real-time progress tracking.

---

## Line Art Production Pipeline

The platform includes an admin-only line art pipeline that converts colored illustrations into production-ready transparent PNGs — the format illustrators and printers need for coloring books and print production.

The pipeline works in three stages:

1. **AI Generation** — Google Gemini converts the colored illustration into clean black-and-white line art
2. **Vectorization** — Potrace traces the raster output into a crisp SVG vector, eliminating artifacts and white traces
3. **PNG Rendering** — Sharp renders the vector to a 2048×2048 transparent PNG at 2x resolution

Line art can be generated per page (with instant download) or in bulk across the entire book with a progress modal, individual retry buttons for failed pages, and automatic ZIP packaging.

---

## Structured Client Review Process

Customers interact with the platform through a secure, token-based review portal — no account creation or login required. They receive a unique link and are guided through a structured review flow.

### Character Design Phase

Customers fill out character detail forms one at a time in a guided, sequential flow with a progress bar. Each form captures the character's age, hair, clothing, personality, and distinguishing features. Once submitted, the AI generates character illustrations based on these descriptions, and the customer reviews and either approves or requests changes — all within the same portal.

### Illustration Review Phase

After character approval, the admin generates and sends sketches. The customer reviews each page's sketch and can request revisions with written notes, creating a per-page conversation thread. The admin can reply, regenerate based on the feedback, and mark issues as resolved. The customer can accept the admin's response, send follow-ups, or continue the conversation. The full revision history is preserved and viewable at any time, organized by revision round.

### One-Click Approval

When the customer is satisfied with all sketches, they approve everything with a single click, advancing the project to the delivery stage.

---

## Project Management & Communication Hub

Beyond illustration generation, the platform functions as a full project management system with multi-channel communication built in.

### Multi-Channel Notifications

Every significant event in the project lifecycle triggers notifications across multiple channels:

- **Email** (via Resend) — customer-facing notifications with styled HTML templates, review links, and anti-threading measures to prevent Gmail from collapsing messages. Email templates adapt based on the revision round (first send vs. subsequent revisions).
- **Slack** (via webhooks) — internal team notifications for every project event: character submissions with full detail summaries, generation completions with success/failure counts, customer feedback with quoted text, approvals, and follow-ups. Each notification includes direct links to the relevant project.
- **SMS** (via Quo.com) — optional customer notification channel, ready for activation.

All notifications are non-blocking — a failure in any channel never stops a workflow.

### Version Tracking & Send Counts

The platform tracks every send cycle with dedicated counters for character review rounds and illustration review rounds. Each feedback resolution is tagged with its revision round number, creating a complete audit trail of which issues were resolved in which cycle.

### Feedback Thread System

Each page has its own conversation thread supporting back-and-forth dialogue between admin and customer. Threads support replies, follow-ups, acceptance, and manual resolution. Admin replies can be edited (only if the customer hasn't responded yet), and the entire conversation history is archived with timestamps when resolved.

### Silent Push Updates

The admin can silently sync updated illustrations to the customer's view without sending any notifications or changing the project status — useful for fixing minor issues before the customer reviews.

### Coloring Request Workflow

A dedicated feature lets the admin send Page 1's sketch and illustration directly to the studio's coloring artist via email, with the project's admin and customer links included.

### Delivery Options

After approval, the admin has multiple delivery paths:

- Download sketches + colored illustrations as a ZIP
- Download line art + colored illustrations as a ZIP
- Generate and download line art in bulk with progress tracking
- Email any package directly to the studio's email (large files >40MB auto-upload to Cloudflare R2 with expiring download links)

---

## Scheduled Sends

Admins can schedule character review sends and sketch sends to execute at a future time rather than sending immediately. This is useful for coordinating delivery across timezones (team members in Canada, Armenia, and Australia).

### How It Works

- Every send button ("Send Sketches," "Resend Sketches," "Send Characters," "Resend Characters") is a split button: clicking the main area sends immediately, clicking the `▾` dropdown opens a schedule popover.
- The schedule popover lets the admin pick an hour (00:00–23:00 in 24-hour format) and a day (Today, After 1–7 days), all in the admin's local timezone.
- The local time is automatically converted to UTC for storage.
- Once scheduled, the button displays the scheduled time (e.g., `🕐 Mar 6, 14:00`) with a cancel `✕` button.
- If a send fails, the button shows `⚠️ Send Failed — Retry ▾` with options to retry immediately or reschedule.

### Technical Implementation

- **Database:** `scheduled_sends` table stores pending/completed/failed/cancelled sends.
- **Execution:** Supabase `pg_cron` runs every minute and calls the `/api/scheduled-sends/execute` endpoint (authenticated with `CRON_SECRET`).
- **Content:** Always sends the *latest* version of content at execution time — if illustrations are regenerated between scheduling and sending, the new versions are delivered.
- **Status:** Scheduling does *not* change project status; status changes only when the send actually executes.

---

## The Admin Dashboard

The admin side provides a complete project management interface:

- **Project dashboard** with all active projects, author names, and status indicators
- **Manuscript editor** with inline editing, scroll-spy navigation, and bulk page editing
- **Character management** with generation, regeneration (with AI model dropdown and optional deep thinking toggle), manual upload, and side-by-side sketch/colored views
- **Illustration management** with comparison mode, batch generation, layout controls (single page, spread, spot illustrations), and the AI Director for character action/emotion control
- **Page management** with delete functionality (automatic renumbering and storage cleanup) and story text clipboard copy
- **Sketch/Story toggle** on illustration cards with "This page" / "All pages" scope selector (admin-only popover)
- **Adaptive text layout** — story text and editable scene descriptions share the card space dynamically; story text takes what it needs, scene description fills the rest
- **Scheduled sends** — split buttons for all send/resend actions with schedule popover, scheduled state display, and failed state with retry
- **Settings panel** for toggling customer visibility of colored images, managing downloads, and controlling email delivery
- **Real-time updates** via Supabase subscriptions — changes appear instantly across all connected views

---

## Technical Foundation

- **Framework:** Next.js 16 with TypeScript (strict mode)
- **AI Text:** OpenAI GPT-5.4 (story analysis, character identification, scene descriptions — Structured Outputs with reasoning)
- **AI Image:** Google Gemini 3.1 Flash Image Preview "NB2" (default) + Gemini 3 Pro Image Preview "NB Pro" + OpenAI GPT Image 1.5 — modular engine architecture for easy model addition/removal
- **Database & Storage:** Supabase (PostgreSQL + Storage buckets for all assets) with `pg_cron` + `pg_net` for scheduled job execution
- **Cloud Storage:** Cloudflare R2 for temporary large file hosting (email attachments >40MB)
- **Image Processing:** Potrace (vectorization) + Sharp (PNG rendering)
- **Communication:** Resend (email with R2 download links for large files), Slack webhooks, Quo.com (SMS)
- **UI:** Tailwind CSS + shadcn/ui, fully mobile-responsive
- **Deployment:** Railway with auto-deploy from GitHub
- **Reliability:** Environment variable validation on startup, structured error handling throughout, automatic retries for AI generation

---

This isn't just an illustration tool — it's a complete production pipeline that takes a manuscript and turns it into a reviewed, approved, production-ready illustrated book, with every stakeholder connected and every revision tracked.
