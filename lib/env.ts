/**
 * Validates that all required environment variables are set.
 * Called once at startup to fail fast with a clear message
 * instead of crashing later with cryptic errors.
 */

const REQUIRED_SERVER_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENAI_API_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'RESEND_API_KEY',
] as const

/** Optional vars that enhance functionality but aren't required to start */
const OPTIONAL_VARS = [
  'NEXT_PUBLIC_BASE_URL',
  'SLACK_WEBHOOK_URL',
  'QUO_API_KEY',
  'QUO_PHONE_NUMBER',
  'MIGRATION_SECRET_TOKEN',
  'DATABASE_URL',
] as const

export function validateEnv() {
  const missing: string[] = []

  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n❌ Missing required environment variables:\n${missing.map(k => `   - ${k}`).join('\n')}\n`
    )
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }

  // Log optional vars status in development
  if (process.env.NODE_ENV === 'development') {
    const missingOptional = OPTIONAL_VARS.filter(k => !process.env[k])
    if (missingOptional.length > 0) {
      console.info(
        `ℹ️  Optional env vars not set: ${missingOptional.join(', ')}`
      )
    }
  }
}
