/**
 * Project Status Constants
 * 
 * Centralized definitions for all project statuses used throughout the app.
 * This file serves as the single source of truth for:
 * - Status values
 * - Status groupings (which statuses belong to which phase)
 * - Status checks (is a project in review mode? illustration mode? etc.)
 * 
 * IMPORTANT: When adding new statuses, update both the type definition
 * in types/project.ts AND the constants here.
 */

// ============================================================================
// STATUS VALUES
// ============================================================================

/**
 * All valid project status values
 */
export const PROJECT_STATUSES = {
  // Initial
  DRAFT: 'draft',
  AWAITING_CUSTOMER_INPUT: 'awaiting_customer_input', // Customer submission wizard (Path B)
  
  // Character Phase
  CHARACTER_REVIEW: 'character_review',
  CHARACTER_GENERATION: 'character_generation',
  CHARACTER_GENERATION_COMPLETE: 'character_generation_complete',
  CHARACTER_REVISION_NEEDED: 'character_revision_needed',
  CHARACTERS_APPROVED: 'characters_approved',
  CHARACTERS_REGENERATED: 'characters_regenerated',
  
  // Illustration Phase
  SKETCHES_REVIEW: 'sketches_review',
  SKETCHES_REVISION: 'sketches_revision',
  ILLUSTRATION_APPROVED: 'illustration_approved',
  
  // Legacy (for migration compatibility - DO NOT USE for new features)
  LEGACY_TRIAL_REVIEW: 'trial_review',
  LEGACY_TRIAL_REVISION: 'trial_revision',
  LEGACY_TRIAL_APPROVED: 'trial_approved',
  LEGACY_ILLUSTRATIONS_GENERATING: 'illustrations_generating',
  LEGACY_ILLUSTRATION_REVIEW: 'illustration_review',
  LEGACY_ILLUSTRATION_REVISION_NEEDED: 'illustration_revision_needed',
  
  // Final
  COMPLETED: 'completed',
} as const

export type ProjectStatusValue = typeof PROJECT_STATUSES[keyof typeof PROJECT_STATUSES]

// ============================================================================
// STATUS GROUPS
// ============================================================================

/**
 * Statuses where customer can submit feedback/reviews
 */
export const REVIEWABLE_STATUSES: readonly string[] = [
  PROJECT_STATUSES.CHARACTER_REVIEW,
  PROJECT_STATUSES.CHARACTER_REVISION_NEEDED,
  PROJECT_STATUSES.SKETCHES_REVIEW,
  PROJECT_STATUSES.SKETCHES_REVISION,
  // Legacy
  PROJECT_STATUSES.LEGACY_TRIAL_REVIEW,
  PROJECT_STATUSES.LEGACY_TRIAL_REVISION,
  PROJECT_STATUSES.LEGACY_ILLUSTRATION_REVIEW,
  PROJECT_STATUSES.LEGACY_ILLUSTRATION_REVISION_NEEDED,
] as const

/**
 * Statuses that are in illustration/sketch mode (not character mode)
 */
export const ILLUSTRATION_MODE_STATUSES: readonly string[] = [
  PROJECT_STATUSES.CHARACTERS_APPROVED,
  PROJECT_STATUSES.SKETCHES_REVIEW,
  PROJECT_STATUSES.SKETCHES_REVISION,
  PROJECT_STATUSES.ILLUSTRATION_APPROVED,
  // Legacy
  PROJECT_STATUSES.LEGACY_TRIAL_REVIEW,
  PROJECT_STATUSES.LEGACY_TRIAL_REVISION,
  PROJECT_STATUSES.LEGACY_TRIAL_APPROVED,
  PROJECT_STATUSES.LEGACY_ILLUSTRATIONS_GENERATING,
  PROJECT_STATUSES.LEGACY_ILLUSTRATION_REVIEW,
  PROJECT_STATUSES.LEGACY_ILLUSTRATION_REVISION_NEEDED,
] as const

/**
 * Statuses that are in character review/definition mode
 */
export const CHARACTER_MODE_STATUSES: readonly string[] = [
  PROJECT_STATUSES.CHARACTER_REVIEW,
  PROJECT_STATUSES.CHARACTER_GENERATION,
  PROJECT_STATUSES.CHARACTER_GENERATION_COMPLETE,
  PROJECT_STATUSES.CHARACTER_REVISION_NEEDED,
] as const

/**
 * Statuses where the project is actively being processed (no user action needed)
 */
export const PROCESSING_STATUSES: readonly string[] = [
  PROJECT_STATUSES.CHARACTER_GENERATION,
  PROJECT_STATUSES.LEGACY_ILLUSTRATIONS_GENERATING,
] as const

/**
 * Statuses that indicate approval/completion
 */
export const APPROVED_STATUSES: readonly string[] = [
  PROJECT_STATUSES.CHARACTERS_APPROVED,
  PROJECT_STATUSES.ILLUSTRATION_APPROVED,
  PROJECT_STATUSES.LEGACY_TRIAL_APPROVED,
  PROJECT_STATUSES.COMPLETED,
] as const

/**
 * Legacy statuses that should eventually be migrated
 */
export const LEGACY_STATUSES: readonly string[] = [
  PROJECT_STATUSES.LEGACY_TRIAL_REVIEW,
  PROJECT_STATUSES.LEGACY_TRIAL_REVISION,
  PROJECT_STATUSES.LEGACY_TRIAL_APPROVED,
  PROJECT_STATUSES.LEGACY_ILLUSTRATIONS_GENERATING,
  PROJECT_STATUSES.LEGACY_ILLUSTRATION_REVIEW,
  PROJECT_STATUSES.LEGACY_ILLUSTRATION_REVISION_NEEDED,
] as const

// ============================================================================
// STATUS CHECK FUNCTIONS
// ============================================================================

/**
 * Check if a status allows customer review/feedback submission
 */
export function isReviewableStatus(status: string): boolean {
  return REVIEWABLE_STATUSES.includes(status)
}

/**
 * Check if a status is in illustration mode (vs character mode)
 */
export function isIllustrationModeStatus(status: string): boolean {
  return ILLUSTRATION_MODE_STATUSES.includes(status)
}

/**
 * Check if a status is in character mode
 */
export function isCharacterModeStatus(status: string): boolean {
  return CHARACTER_MODE_STATUSES.includes(status)
}

/**
 * Check if a status indicates the project is being processed
 */
export function isProcessingStatus(status: string): boolean {
  return PROCESSING_STATUSES.includes(status)
}

/**
 * Check if a status indicates approval/completion
 */
export function isApprovedStatus(status: string): boolean {
  return APPROVED_STATUSES.includes(status)
}

/**
 * Check if a status is a legacy status that should be migrated
 */
export function isLegacyStatus(status: string): boolean {
  return LEGACY_STATUSES.includes(status)
}

/**
 * Get the default tab to show for a given project status
 */
export function getDefaultTabForStatus(status: string): 'pages' | 'characters' | 'illustrations' {
  if (isIllustrationModeStatus(status)) {
    return 'illustrations'
  }
  if (isCharacterModeStatus(status)) {
    return 'characters'
  }
  return 'pages'
}
