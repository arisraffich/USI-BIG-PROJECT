# USI Platform Setup Guide

## Prerequisites

- Node.js 20+
- npm
- A Supabase project with Storage buckets configured
- API keys for OpenAI, Google AI (Gemini), and Resend

## 1. Create `.env.local`

Create a `.env.local` file in the project root with your credentials:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# AI Services
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-key

# Admin Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-to-secure-password

# Email
RESEND_API_KEY=re_...

# App Config
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Optional: Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Optional: SMS (Quo.com)
QUO_API_KEY=your-quo-api-key
QUO_PHONE_NUMBER=+1234567890

# Optional: Direct DB access (for migration scripts only)
DATABASE_URL=postgresql://...
```

**The app validates required env vars on startup.** If any are missing, you'll see a clear error listing exactly which ones are needed.

### Required vs Optional

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase admin access |
| `OPENAI_API_KEY` | Yes | Story analysis, character identification |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Image generation (characters, illustrations, line art) |
| `ADMIN_USERNAME` | Yes | Admin login |
| `ADMIN_PASSWORD` | Yes | Admin login |
| `RESEND_API_KEY` | Yes | Email delivery |
| `NEXT_PUBLIC_BASE_URL` | No | Defaults to `http://localhost:3000` |
| `SLACK_WEBHOOK_URL` | No | Slack notifications |
| `QUO_API_KEY` | No | SMS notifications |
| `QUO_PHONE_NUMBER` | No | SMS sender number |
| `DATABASE_URL` | No | Only for migration scripts |

## 2. Install Dependencies

```bash
cd "/Users/aris/Documents/GitHub/USI Project/usi-platform"
npm install
```

## 3. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- **Admin login:** http://localhost:3000/admin/login
- **Credentials:** Use the `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env.local`

## 4. Supabase Storage Buckets

The app uses these Supabase Storage buckets (create them in Supabase Dashboard > Storage):

| Bucket | Access | Purpose |
|--------|--------|---------|
| `project-files` | Public | Uploaded manuscripts |
| `character-images` | Public | Generated character illustrations |
| `character-sketches` | Public | Character sketch images |
| `illustrations` | Public | Page illustrations and sketches |
| `lineart` | Public | Generated line art PNGs |

## 5. Supabase Realtime

For live updates on the customer review side, enable Realtime for these tables:

```sql
ALTER TABLE "characters" REPLICA IDENTITY FULL;
ALTER TABLE "pages" REPLICA IDENTITY FULL;
ALTER TABLE "projects" REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE "characters";
ALTER PUBLICATION supabase_realtime ADD TABLE "pages";
ALTER PUBLICATION supabase_realtime ADD TABLE "projects";
```

See `supabase/REALTIME_FIX.md` for details.

## Deployment (Railway)

The app deploys to Railway with auto-deploy from GitHub:

1. Push to `main` branch
2. Railway auto-builds and deploys
3. Set all required env vars in Railway dashboard

The `start` script binds to `0.0.0.0` and uses the `PORT` environment variable provided by Railway.

## Troubleshooting- **Port already in use:** Try `PORT=3001 npm run dev`
- **Module errors:** Run `npm install` first
- **Missing env vars:** The app will show a clear error on startup listing which vars are missing
- **Build errors:** Run `npm run build` locally to check before pushing