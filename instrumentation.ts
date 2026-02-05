export async function register() {
  // Validate env vars on server startup (not in edge runtime or client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env')
    validateEnv()
  }
}
