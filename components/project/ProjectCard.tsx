'use client'

import { useState, memo } from 'react'
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
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Yerevan',
      hour12: true,
    })
    return `${dateStr} ${timeStr}`
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="pt-0 pb-0">
        <div className="flex justify-between items-start">
          <Link href={`/admin/project/${project.id}?tab=${getDefaultTabForStatus(project.status)}`} className="flex-1 block cursor-pointer">
            <h2 className="text-xl font-semibold mb-0">
              <span className="text-blue-600">{project.author_firstname} {project.author_lastname}</span> {project.book_title.replace(`${project.author_firstname} ${project.author_lastname}`, '').replace(/^'s\s*/, '').replace(/\bBook\b/i, 'Project').trim()}
            </h2>
            <p className="text-sm text-gray-600">
              {pageCount} {pageCount === 1 ? 'Page' : 'Pages'} | Created: {formatDate(project.created_at)}
            </p>
            {/* Status Badge */}
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeConfig.style}`}>
                {badgeConfig.text}
                {roundNumber && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/50 text-[10px] font-bold">
                    {roundNumber}
                  </span>
                )}
              </span>
              {isFollowUp(project.status) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-900 text-white border border-gray-900">
                  <UserRound className="w-3 h-3" />
                  <span>Follow Up</span>
                </span>
              )}
              {isWorking(project.status) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 border border-gray-300">
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
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Project</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{project.book_title}"? This action cannot be undone.
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
      </CardContent>
    </Card>
  )
})
