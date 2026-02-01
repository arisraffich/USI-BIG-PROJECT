/**
 * Feedback Service
 * 
 * Centralized utilities for feedback resolution operations.
 * This service provides reusable functions for:
 * - Resolving feedback (moving notes to history)
 * - Building feedback history entries
 * - Clearing admin replies
 * 
 * Used by:
 * - send-to-customer/route.ts (when admin sends sketches)
 * - accept-reply/route.ts (when customer accepts admin reply)
 * - confirm/route.ts (when admin confirms regeneration)
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single feedback history entry
 */
export interface FeedbackHistoryEntry {
  note: string
  created_at: string
  revision_round?: number
}

/**
 * Page feedback fields (subset of Page type relevant to feedback)
 */
export interface PageFeedbackFields {
  feedback_notes: string | null
  feedback_history: FeedbackHistoryEntry[] | null
  is_resolved: boolean
  admin_reply: string | null
  admin_reply_at: string | null
}

/**
 * Character feedback fields (subset of Character type relevant to feedback)
 */
export interface CharacterFeedbackFields {
  feedback_notes: string | null
  feedback_history: Array<{ note: string; created_at: string }> | null
  is_resolved: boolean
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a new feedback history entry
 * 
 * @param note - The feedback note text
 * @param revisionRound - Optional revision round number (for pages)
 * @returns A properly formatted history entry
 */
export function createFeedbackHistoryEntry(
  note: string,
  revisionRound?: number
): FeedbackHistoryEntry {
  const entry: FeedbackHistoryEntry = {
    note,
    created_at: new Date().toISOString(),
  }
  
  if (revisionRound !== undefined) {
    entry.revision_round = revisionRound
  }
  
  return entry
}

/**
 * Builds the updated feedback history array by appending a new entry
 * 
 * @param currentHistory - Existing history array (may be null)
 * @param note - The feedback note to add
 * @param revisionRound - Optional revision round number
 * @returns New history array with the entry appended
 */
export function appendToFeedbackHistory(
  currentHistory: FeedbackHistoryEntry[] | null | undefined,
  note: string,
  revisionRound?: number
): FeedbackHistoryEntry[] {
  const history = Array.isArray(currentHistory) ? currentHistory : []
  const newEntry = createFeedbackHistoryEntry(note, revisionRound)
  return [...history, newEntry]
}

/**
 * Builds the database update object for resolving page feedback
 * 
 * @param feedbackNotes - Current feedback notes to resolve
 * @param currentHistory - Existing feedback history
 * @param revisionRound - The revision round this feedback was resolved in
 * @returns Object with fields to update in the database
 */
export function buildPageFeedbackResolutionUpdate(
  feedbackNotes: string | null,
  currentHistory: FeedbackHistoryEntry[] | null | undefined,
  revisionRound: number
): Partial<PageFeedbackFields> {
  if (!feedbackNotes) {
    return {}
  }
  
  return {
    feedback_history: appendToFeedbackHistory(currentHistory, feedbackNotes, revisionRound),
    feedback_notes: null,
    is_resolved: true,
    admin_reply: null,
    admin_reply_at: null,
  }
}

/**
 * Builds the database update object for resolving character feedback
 * (Characters don't have revision_round tracking)
 * 
 * @param feedbackNotes - Current feedback notes to resolve
 * @param currentHistory - Existing feedback history
 * @returns Object with fields to update in the database
 */
export function buildCharacterFeedbackResolutionUpdate(
  feedbackNotes: string | null,
  currentHistory: Array<{ note: string; created_at: string }> | null | undefined
): Partial<CharacterFeedbackFields> {
  if (!feedbackNotes) {
    return {}
  }
  
  const history = Array.isArray(currentHistory) ? currentHistory : []
  
  return {
    feedback_history: [
      ...history,
      { note: feedbackNotes, created_at: new Date().toISOString() }
    ],
    feedback_notes: null,
    is_resolved: true,
  }
}

/**
 * Builds the update object for clearing admin reply
 * Used when admin regenerates an image (addressing feedback with action)
 * 
 * @returns Object with admin reply fields set to null
 */
export function buildClearAdminReplyUpdate(): Pick<PageFeedbackFields, 'admin_reply' | 'admin_reply_at'> {
  return {
    admin_reply: null,
    admin_reply_at: null,
  }
}

/**
 * Checks if a page/character has unresolved feedback
 * 
 * @param feedbackNotes - Current feedback notes
 * @param isResolved - Resolution status
 * @returns true if there's feedback that hasn't been resolved
 */
export function hasUnresolvedFeedback(
  feedbackNotes: string | null | undefined,
  isResolved: boolean | undefined
): boolean {
  return !!feedbackNotes && !isResolved
}

/**
 * Checks if any items in an array have unresolved feedback
 * 
 * @param items - Array of items with feedback_notes and is_resolved fields
 * @returns true if any item has unresolved feedback
 */
export function hasAnyUnresolvedFeedback(
  items: Array<{ feedback_notes?: string | null; is_resolved?: boolean }> | null | undefined
): boolean {
  if (!items || items.length === 0) return false
  return items.some(item => hasUnresolvedFeedback(item.feedback_notes, item.is_resolved))
}
