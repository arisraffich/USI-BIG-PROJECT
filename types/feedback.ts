/**
 * Feedback Types
 * 
 * Centralized type definitions for the feedback/review system.
 * These types are used across:
 * - Page feedback (illustration reviews)
 * - Character feedback (character reviews)
 * - Admin replies (illustrator notes)
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * A single entry in the feedback history
 * Represents a resolved feedback item
 */
export interface FeedbackHistoryEntry {
  /** The original feedback note text */
  note: string
  /** ISO timestamp when the feedback was resolved */
  created_at: string
  /** 
   * Revision round this feedback was resolved in.
   * Only used for page feedback (not character feedback).
   * Round 1 = first revision, Round 2 = second revision, etc.
   */
  revision_round?: number
}

/**
 * Common feedback fields shared between Page and Character
 */
export interface BaseFeedbackFields {
  /** Current active feedback from customer (null if resolved or none) */
  feedback_notes?: string | null
  /** History of resolved feedback items */
  feedback_history?: FeedbackHistoryEntry[] | null
  /** Whether the current feedback has been addressed */
  is_resolved?: boolean
}

/**
 * Page-specific feedback fields (includes admin reply feature)
 */
export interface PageFeedbackFields extends BaseFeedbackFields {
  /** Admin's reply to customer feedback (Illustrator Note) */
  admin_reply?: string | null
  /** Timestamp when admin reply was added */
  admin_reply_at?: string | null
}

/**
 * Character feedback fields (subset of Character type)
 */
export interface CharacterFeedbackFields extends BaseFeedbackFields {
  // Characters use the same base fields, no additional fields
}

// ============================================================================
// API PAYLOAD TYPES
// ============================================================================

/**
 * Payload for saving customer feedback on a page
 */
export interface SavePageFeedbackPayload {
  feedback_notes: string | null
}

/**
 * Payload for admin reply to customer feedback
 */
export interface SaveAdminReplyPayload {
  admin_reply: string
}

/**
 * Payload for customer follow-up after admin reply
 */
export interface CustomerFollowUpPayload {
  feedback_notes: string
}

// ============================================================================
// DATABASE UPDATE TYPES
// ============================================================================

/**
 * Fields that can be updated when resolving page feedback
 */
export interface PageFeedbackResolutionUpdate {
  feedback_notes: null
  feedback_history: FeedbackHistoryEntry[]
  is_resolved: true
  admin_reply: null
  admin_reply_at: null
}

/**
 * Fields that can be updated when resolving character feedback
 */
export interface CharacterFeedbackResolutionUpdate {
  feedback_notes: null
  feedback_history: FeedbackHistoryEntry[]
  is_resolved: true
}

/**
 * Fields for clearing admin reply
 */
export interface ClearAdminReplyUpdate {
  admin_reply: null
  admin_reply_at: null
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Item with feedback fields (for generic functions)
 */
export interface FeedbackableItem {
  feedback_notes?: string | null
  is_resolved?: boolean
}

/**
 * Result of checking feedback status
 */
export interface FeedbackStatus {
  hasFeedback: boolean
  isResolved: boolean
  hasAdminReply?: boolean
}
