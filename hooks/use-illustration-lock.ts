/**
 * useIllustrationLock Hook
 * 
 * Centralized lock logic for the illustration workflow.
 * Determines what actions are available based on project status and user mode.
 * 
 * STATUSES:
 * - characters_approved: Admin can generate, customer cannot see illustrations tab
 * - sketches_review: Customer reviewing, both can see all pages
 * - sketches_revision: Customer requested changes, admin regenerating
 * - illustration_approved: Final state, customer locked from editing
 * - completed: Project done
 */

import { useMemo } from 'react'

type ProjectStatus = string | undefined

interface Page {
  page_number: number
  illustration_url?: string | null
  customer_illustration_url?: string | null
  customer_sketch_url?: string | null
}

interface UseIllustrationLockOptions {
  projectStatus: ProjectStatus
  mode: 'admin' | 'customer'
  pages?: Page[]
}

interface UseIllustrationLockResult {
  /**
   * Customer is locked from making edits (feedback, revisions)
   * True when project is approved or completed
   */
  isCustomerLocked: boolean
  
  /**
   * Pages 2+ are unlocked for viewing/interaction
   * Admin: After page 1 is generated OR in review phases
   * Customer: After sketches are sent (sketches_review+)
   */
  isPagesUnlocked: boolean
  
  /**
   * Customer can see all pages (not just page 1)
   * True when in sketches_review, sketches_revision, illustration_approved, or completed
   */
  isCustomerUnlocked: boolean
  
  /**
   * Admin can access pages 2+ for generation
   * True when page 1 is generated OR in review phases
   */
  isAdminUnlocked: boolean
  
  /**
   * Customer can see the Illustrations tab at all
   * True when in sketches phase or later
   */
  canCustomerSeeIllustrations: boolean
  
  /**
   * Check if a specific page is locked (pages 2+ before unlock)
   */
  isPageLocked: (pageNumber: number) => boolean
  
  /**
   * Filter pages to only show visible ones for the current mode
   */
  filterVisiblePages: <T extends Page>(pages: T[]) => T[]
}

// Statuses where customer can see all pages
const CUSTOMER_UNLOCKED_STATUSES = [
  'sketches_review',
  'sketches_revision',
  'illustration_approved',
  'completed',
]

// Statuses where customer is locked from editing
const CUSTOMER_LOCKED_STATUSES = [
  'illustration_approved',
  'completed',
]

// Statuses where admin has all pages unlocked (regardless of page 1 generation)
const ADMIN_UNLOCKED_STATUSES = [
  'sketches_review',
  'sketches_revision',
  'illustration_approved',
  'completed',
]

export function useIllustrationLock({
  projectStatus,
  mode,
  pages = [],
}: UseIllustrationLockOptions): UseIllustrationLockResult {
  
  return useMemo(() => {
    const status = projectStatus || ''
    
    // Check if page 1 has been generated
    const page1 = pages.find(p => p.page_number === 1)
    const page1Generated = !!page1?.illustration_url
    
    // Customer locked from editing (feedback controls disabled)
    const isCustomerLocked = CUSTOMER_LOCKED_STATUSES.includes(status)
    
    // Customer can see all pages (not just page 1)
    const isCustomerUnlocked = CUSTOMER_UNLOCKED_STATUSES.includes(status)
    
    // Admin can access pages 2+ (either page 1 generated OR in review phases)
    const isAdminUnlocked = page1Generated || ADMIN_UNLOCKED_STATUSES.includes(status)
    
    // Pages 2+ unlocked based on mode
    const isPagesUnlocked = mode === 'admin' ? isAdminUnlocked : isCustomerUnlocked
    
    // Customer can see Illustrations tab
    const canCustomerSeeIllustrations = CUSTOMER_UNLOCKED_STATUSES.includes(status)
    
    // Check if a specific page is locked
    const isPageLocked = (pageNumber: number): boolean => {
      // Page 1 is never locked
      if (pageNumber === 1) return false
      // Pages 2+ are locked until unlocked
      return !isPagesUnlocked
    }
    
    // Filter pages to only show visible ones
    const filterVisiblePages = <T extends Page>(pagesToFilter: T[]): T[] => {
      return pagesToFilter.filter(p => {
        // Admin always sees all pages (if unlocked) or just page 1
        if (mode === 'admin') {
          return isPagesUnlocked || p.page_number === 1
        }
        
        // Customer: Page 1 always visible
        if (p.page_number === 1) return true
        
        // Customer: All pages visible after unlocked
        if (isCustomerUnlocked) return true
        
        // Customer: Show pages that have been explicitly sent
        return !!p.customer_illustration_url || !!p.customer_sketch_url
      })
    }
    
    return {
      isCustomerLocked,
      isPagesUnlocked,
      isCustomerUnlocked,
      isAdminUnlocked,
      canCustomerSeeIllustrations,
      isPageLocked,
      filterVisiblePages,
    }
  }, [projectStatus, mode, pages])
}
