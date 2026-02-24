# AGENTS.md

## Cursor Cloud specific instructions

### Overview

USI Platform is a single Next.js 16 (App Router + Turbopack) application for managing children's book illustration projects. All data is stored in cloud-hosted Supabase (PostgreSQL + Storage). There is no local database or Docker dependency.

### Running the dev server

The `npm run dev` script wraps `next dev` with `railway run` (to inject Railway env vars). In cloud agent environments without Railway CLI configured, run directly:

```bash
npx next dev --port 3000
```

The app requires 8 environment variables at startup (validated in `instrumentation.ts` → `lib/env.ts`). If any are missing, the server crashes immediately. A `.env.local` with placeholder values is sufficient to start the server and render UI. See the README "Environment Variables" section for the full list.

### Lint

```bash
npx eslint
```

The codebase has pre-existing lint warnings/errors (mostly `@typescript-eslint/no-explicit-any`). These are not blockers.

### Build

```bash
npx next build
```

### Admin login

Navigate to `/login`. Credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars. With placeholder `.env.local`, use `admin` / `admin123`.

### Key caveats

- **No test suite**: There are no automated tests (no `jest`, `vitest`, or test scripts). Validation is manual via the browser.
- **External services only**: Supabase, OpenAI, Google Gemini, and Resend are all cloud-hosted. Without real API keys, the dashboard renders but cannot load/create projects (expected "Unable to load projects" message).
- **Package manager**: npm (lockfile: `package-lock.json`). Do not use yarn/pnpm.
- **Node.js**: Requires Node 20+. The environment has v22 pre-installed.
