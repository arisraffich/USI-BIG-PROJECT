/**
 * Status Badge Configuration
 * 
 * Centralized color and text definitions for project status badges.
 * Used by both the Dashboard (ProjectCard) and Project Header (ProjectHeader).
 * 
 * Change colors here → updates everywhere automatically.
 */

// ============================================================================
// COLOR DEFINITIONS
// ============================================================================

/**
 * Cyan shades for character phase (progression from light to dark)
 */
const CYAN_20 = 'bg-cyan-50 text-cyan-700 border-cyan-200'
const CYAN_40 = 'bg-cyan-100 text-cyan-800 border-cyan-300'
const CYAN_60 = 'bg-cyan-200 text-cyan-900 border-cyan-400'
const CYAN_80 = 'bg-cyan-300 text-cyan-900 border-cyan-500'
const CYAN_100 = 'bg-cyan-400 text-cyan-950 border-cyan-600'

/**
 * Other badge colors
 */
const BLUE = 'bg-blue-100 text-blue-800 border-blue-300'
const PURPLE = 'bg-purple-100 text-purple-800 border-purple-300'
const AMBER = 'bg-amber-100 text-amber-800 border-amber-300'
const ORANGE = 'bg-orange-100 text-orange-800 border-orange-300'
const GREEN = 'bg-green-100 text-green-800 border-green-300'
const RED = 'bg-red-100 text-red-800 border-red-300'
const GRAY = 'bg-gray-100 text-gray-800 border-gray-300'
const OUTLINE = 'bg-transparent text-gray-600 border-gray-300'

// ============================================================================
// BADGE CONFIGURATION
// ============================================================================

export interface StatusBadgeConfig {
  text: string
  style: string
  showRound?: boolean // Whether to show round number
}

/**
 * Get badge configuration for a given project status
 */
export function getStatusBadgeConfig(
  status: string,
  characterSendCount: number = 0,
  illustrationSendCount: number = 0
): StatusBadgeConfig {
  
  // -------------------------------------------------------------------------
  // CHARACTER PHASE
  // -------------------------------------------------------------------------
  
  if (status === 'draft') {
    return {
      text: 'Project Created',
      style: OUTLINE,
    }
  }
  
  if (status === 'character_review') {
    // Distinguish between forms sent (no characters yet) vs characters sent
    if (!characterSendCount || characterSendCount === 0) {
      return {
        text: 'Character Forms Sent',
        style: CYAN_20,
      }
    }
    if (characterSendCount === 1) {
      return {
        text: 'Characters Sent',
        style: CYAN_60,
      }
    }
    // Resent (count > 1)
    return {
      text: 'Character Resent',
      style: CYAN_100,
      showRound: true,
    }
  }
  
  if (status === 'character_generation') {
    return {
      text: 'Generating Characters...',
      style: CYAN_40,
    }
  }
  
  if (status === 'character_generation_complete') {
    return {
      text: 'Characters Created',
      style: CYAN_40,
    }
  }
  
  if (status === 'character_revision_needed') {
    return {
      text: 'Character Revision',
      style: CYAN_80,
      showRound: true,
    }
  }
  
  if (status === 'characters_regenerated') {
    return {
      text: 'Characters Regenerated',
      style: CYAN_60,
    }
  }
  
  if (status === 'characters_approved') {
    return {
      text: 'Characters Approved',
      style: BLUE,
    }
  }
  
  // -------------------------------------------------------------------------
  // ILLUSTRATION/SKETCHES PHASE
  // -------------------------------------------------------------------------
  
  if (status === 'sketches_review') {
    if (illustrationSendCount <= 1) {
      return {
        text: 'Sketches Sent',
        style: PURPLE,
      }
    }
    // Resent (count > 1)
    return {
      text: 'Sketches Resent',
      style: ORANGE,
      showRound: true,
    }
  }
  
  if (status === 'sketches_revision') {
    return {
      text: 'Sketches Revision',
      style: AMBER,
      showRound: true,
    }
  }
  
  if (status === 'illustration_approved') {
    return {
      text: 'Sketches Approved',
      style: GREEN,
    }
  }
  
  // -------------------------------------------------------------------------
  // LEGACY STATUSES (for backward compatibility)
  // -------------------------------------------------------------------------
  
  if (status === 'trial_review' || status === 'illustration_review') {
    return {
      text: 'Sketches Sent',
      style: PURPLE,
    }
  }
  
  if (status === 'trial_revision' || status === 'illustration_revision_needed') {
    return {
      text: 'Sketches Revision',
      style: AMBER,
      showRound: true,
    }
  }
  
  if (status === 'trial_approved') {
    return {
      text: 'Sketches Approved',
      style: GREEN,
    }
  }
  
  if (status === 'illustrations_generating') {
    return {
      text: 'Generating...',
      style: PURPLE,
    }
  }
  
  if (status === 'completed') {
    return {
      text: 'Completed',
      style: GREEN,
    }
  }
  
  // -------------------------------------------------------------------------
  // FALLBACK
  // -------------------------------------------------------------------------
  
  return {
    text: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    style: OUTLINE,
  }
}

/**
 * Get the round number to display for revision/resent badges
 */
export function getRoundNumber(
  status: string,
  characterSendCount: number = 0,
  illustrationSendCount: number = 0
): number {
  // For character statuses, use character_send_count
  if (status.includes('character')) {
    return characterSendCount || 1
  }
  // For sketch/illustration statuses, use illustration_send_count
  return illustrationSendCount || 1
}

// ============================================================================
// EXPORTS FOR DIRECT COLOR ACCESS (for ProjectHeader customization)
// ============================================================================

export const BADGE_COLORS = {
  CYAN_20,
  CYAN_40,
  CYAN_60,
  CYAN_80,
  CYAN_100,
  BLUE,
  PURPLE,
  AMBER,
  ORANGE,
  GREEN,
  RED,
  GRAY,
  OUTLINE,
} as const
