/**
 * Safely extracts an error message from an unknown caught value.
 * TypeScript catch clauses should use `unknown` instead of `any`.
 */
export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message) || fallback
  }
  return fallback
}
