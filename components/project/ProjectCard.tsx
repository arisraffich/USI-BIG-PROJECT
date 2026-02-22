'use client'

import { useState, useRef, useCallback, memo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2, Clock, UserRound, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { getStatusBadgeConfig, getRoundNumber, isFollowUp, isWorking } from '@/lib/constants/statusBadgeConfig'

interface Project {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  author_email: string
  created_at: string
  status: string
  status_changed_at?: string
  character_send_count?: number
  illustration_send_count?: number
}

interface ProjectCardProps {
  project: Project
  pageCount?: number
}

// Determine which tab to open based on project status
function getDefaultTabForStatus(status: string): string {
  // Illustration stages (including legacy statuses for backward compatibility)
  const illustrationStatuses = [
    'characters_approved',
    'sketches_review',
    'sketches_revision',
    'illustration_approved',
    'completed',
    // Legacy statuses (for backward compatibility)
    'trial_review',
    'trial_revision',
    'trial_approved',
    'illustrations_generating',
    'illustration_review',
    'illustration_revision_needed',
  ]
  if (illustrationStatuses.includes(status)) {
    return 'illustrations'
  }
  
  // Character stages
  const characterStatuses = [
    'character_review',
    'character_generation',
    'character_generation_complete',
    'character_revision_needed',
    'characters_regenerated',
  ]
  if (characterStatuses.includes(status)) {
    return 'characters'
  }
  
  // Default to pages (draft, or any unknown status)
  return 'pages'
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return 'Just now'
  if (diffDays < 1) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays === 7) return 'A week ago'
  if (diffDays < 14) return 'Over a week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  const months = Math.floor(diffDays / 30)
  if (months === 1) return 'A month ago'
  return `${months} months ago`
}

export const ProjectCard = memo(function ProjectCard({ project, pageCount = 0 }: ProjectCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Get badge configuration
  const badgeConfig = getStatusBadgeConfig(
    project.status,
    project.character_send_count || 0,
    project.illustration_send_count || 0
  )
  const roundNumber = badgeConfig.showRound
    ? getRoundNumber(project.status, project.character_send_count || 0, project.illustration_send_count || 0)
    : null

  async function handleDelete(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete project')
      }

      toast.success('Project deleted successfully')
      setIsDialogOpen(false)
      router.push('/admin/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Delete error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete project')
      setIsDialogOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    // Ensure the date string is treated as UTC if it doesn't have timezone info
    // Supabase returns timestamps in UTC format like "2025-12-05T01:15:00.000Z" or "2025-12-05 01:15:00"
    let date: Date
    if (dateString.includes('T') && dateString.includes('Z')) {
      // Already has UTC indicator
      date = new Date(dateString)
    } else if (dateString.includes('T')) {
      // ISO format without Z, assume UTC
      date = new Date(dateString + 'Z')
    } else {
      // PostgreSQL timestamp format "2025-12-05 01:15:00" - treat as UTC
      date = new Date(dateString.replace(' ', 'T') + 'Z')
    }
    
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Yerevan',
    })
    const timeStr12 = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Yerevan',
      hour12: true,
    })
    const timeStr24 = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Yerevan',
      hour12: false,
    })
    return { full: `${dateStr} ${timeStr12}`, compact: `${dateStr} ${timeStr24}` }
  }

  // Swipe-to-delete state (mobile only)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStartX = useRef(0)
  const touchCurrentX = useRef(0)
  const isSwiping = useRef(false)
  const DELETE_THRESHOLD = 80

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
    isSwiping.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX
    const diff = touchStartX.current - touchCurrentX.current
    if (Math.abs(diff) > 10) isSwiping.current = true
    if (isSwiping.current) {
      setSwipeOffset(Math.max(0, Math.min(diff, DELETE_THRESHOLD)))
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset >= DELETE_THRESHOLD * 0.6) {
      setSwipeOffset(DELETE_THRESHOLD)
    } else {
      setSwipeOffset(0)
    }
    isSwiping.current = false
  }, [swipeOffset])

  const resetSwipe = useCallback(() => setSwipeOffset(0), [])

  const followUpBadge = isFollowUp(project.status)
  const workingBadge = isWorking(project.status)

  const cardContent = (
    <>
      <Link href={`/admin/project/${project.id}?tab=${getDefaultTabForStatus(project.status)}`} className="flex-1 block cursor-pointer min-w-0">
        <h2 className="text-xl font-semibold mb-0">
          <span className="text-blue-600">{project.author_firstname} {project.author_lastname}</span> {project.book_title.replace(`${project.author_firstname} ${project.author_lastname}`, '').replace(/^'s\s*/, '').replace(/\bBook\b/i, 'Project').trim()}
        </h2>
        <p className="text-sm text-gray-600">
          <span className="hidden md:inline">{pageCount} {pageCount === 1 ? 'Page' : 'Pages'} | Created: {formatDate(project.created_at).full}</span>
          <span className="md:hidden">{pageCount} {pageCount === 1 ? 'Page' : 'Pages'} | {formatDate(project.created_at).compact}</span>
        </p>
        {/* Status badges + follow up/working + time */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeConfig.style}`}>
            {badgeConfig.text}
            {roundNumber && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/50 text-[10px] font-bold">
                {roundNumber}
              </span>
            )}
          </span>
          {followUpBadge && (
            <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-900 text-white border border-gray-900">
              <UserRound className="w-3 h-3" />
              <span>Follow Up</span>
            </span>
          )}
          {workingBadge && (
            <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 border border-gray-300">
              <Wrench className="w-3 h-3" />
              Working
            </span>
          )}
          {project.status_changed_at && project.status !== 'illustration_approved' && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
              <Clock className="w-3.5 h-3.5" /> {timeAgo(project.status_changed_at)}
            </span>
          )}
        </div>
      </Link>
      {/* Desktop: delete button + mobile: follow up/working icon */}
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Mobile: follow up/working icon */}
        {followUpBadge && (
          <span className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white">
            <UserRound className="w-4 h-4" />
          </span>
        )}
        {workingBadge && (
          <span className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 border border-gray-300">
            <Wrench className="w-4 h-4" />
          </span>
        )}
        {/* Desktop: delete button */}
        <div className="hidden md:block">
          <AlertDialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetSwipe() }}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{project.book_title}&quot;? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop card */}
      <Card className="hidden md:block hover:shadow-lg transition-shadow">
        <CardContent className="pt-0 pb-0">
          <div className="flex justify-between items-start">
            {cardContent}
          </div>
        </CardContent>
      </Card>

      {/* Mobile card with swipe-to-delete */}
      <div className="md:hidden relative overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Delete button revealed behind card */}
        <div className="absolute inset-y-0 right-0 flex items-center">
          <button
            onClick={() => setIsDialogOpen(true)}
            className="h-full px-6 bg-red-600 text-white flex flex-col items-center justify-center gap-1 font-medium text-sm"
          >
            <Trash2 className="w-5 h-5" />
            Delete
          </button>
        </div>

        {/* Sliding card content */}
        <div
          className="relative bg-card z-10 px-4 py-3"
          style={{
            transform: `translateX(-${swipeOffset}px)`,
            transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={swipeOffset > 0 ? (e) => { e.preventDefault(); e.stopPropagation(); resetSwipe() } : undefined}
        >
          <div className="flex justify-between items-start">
            {cardContent}
          </div>
        </div>

        {/* Mobile delete confirmation dialog */}
        <AlertDialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetSwipe() }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{project.book_title}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  )
})
