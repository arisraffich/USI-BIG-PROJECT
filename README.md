# US Illustrations Platform

A full-stack platform for managing children's book illustration projects. Handles the complete workflow from manuscript upload through AI-powered character and illustration generation to customer review and final delivery.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **AI Generation:** 
  - OpenAI GPT-5.2 (story analysis, character identification)
  - Google Gemini 3 Pro (image generation, sketch conversion)
- **Email:** Resend
- **Notifications:** Slack Webhooks
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Deployment:** Railway

## Features

### Admin Side
- **Project Creation:** Upload manuscript (PDF/DOCX/TXT), AI analyzes and splits into pages
- **Character Management:** AI identifies characters, generates images from descriptions
- **Illustration Generation:** AI creates illustrations for each page with character consistency
- **Sketch Generation:** Automatic B&W sketch conversion for customer preview
- **Regeneration with Comparison:** Side-by-side old vs new comparison before committing changes
- **Batch Generation:** Generate all remaining illustrations in parallel
- **Push Updates:** Silently sync changes to customer without notifications

### Customer Side
- **Review Portal:** Token-based access (no login required)
- **Character Forms:** Sequential form-filling with progress tracking
- **Illustration Review:** View sketches, request revisions with notes
- **Revision History:** Track all feedback rounds with visual badges
- **One-Click Approval:** Approve all sketches to proceed to production

### Notifications
- Slack notifications for project events
- Email notifications with download links on approval
- SMS support (optional)

## Project Workflow

```
1. Project Creation
   └─> AI analyzes manuscript, identifies characters, splits into pages

2. Character Stage
   └─> Admin sends character forms to customer
   └─> Customer fills out character details
   └─> AI generates character images
   └─> Customer reviews and approves (or requests revisions)

3. Illustration Stage
   └─> Admin generates illustrations (Page 1 first, then all unlock)
   └─> AI creates colored illustrations + B&W sketches
   └─> Admin sends sketches to customer for review

4. Review Stage
   └─> Customer reviews each page
   └─> Can request revisions with notes
   └─> Admin regenerates as needed

5. Approval
   └─> Customer approves all sketches
   └─> Email sent with download link
   └─> ZIP file contains all sketches and illustrations
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase project
- OpenAI API key
- Google AI API key
- Resend account (for emails)
- Slack webhook (for notifications)

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

# Notifications
RESEND_API_KEY=re_...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Optional: SMS
QUO_API_KEY=...
QUO_PHONE_NUMBER=...

# Optional: Direct DB access (for migrations)
DATABASE_URL=postgresql://...
```

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

The app is configured for Railway deployment:

```bash
# Build
npm run build

# Start (Railway uses this)
npm start
```

The `start` script binds to `0.0.0.0` and uses the `PORT` environment variable.

## Project Structure

```
usi-platform/
├── app/
│   ├── admin/           # Admin dashboard and project management
│   ├── api/             # API routes
│   │   ├── ai/          # AI character identification
│   │   ├── characters/  # Character CRUD and generation
│   │   ├── illustrations/ # Illustration generation and management
│   │   ├── projects/    # Project CRUD
│   │   └── review/      # Customer review endpoints
│   ├── login/           # Admin login
│   └── review/          # Customer review portal
├── components/
│   ├── admin/           # Admin-specific components
│   ├── illustration/    # Shared illustration components
│   ├── review/          # Customer review components
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── ai/              # AI integration (OpenAI, Google)
│   ├── notifications/   # Email, Slack, SMS
│   └── supabase/        # Database client
├── hooks/               # Custom React hooks
├── types/               # TypeScript types
└── supabase/
    └── migrations/      # Database migrations
```

## Key Components

- **SharedIllustrationBoard:** Core component for displaying illustrations with sketch/colored views
- **UnifiedCharacterCard:** Reusable character card for admin and customer
- **CustomerProjectTabsContent:** Main customer review interface
- **IllustrationsTabContent:** Admin illustration management with comparison mode

## Database Schema

Main tables:
- `projects` - Project metadata, status, settings
- `pages` - Manuscript pages with story text and illustrations
- `characters` - Character definitions and generated images

See `/supabase/migrations/` for full schema.

## License

Private - US Illustrations
