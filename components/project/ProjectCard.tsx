'use client'

import { useState, memo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2 } from 'lucide-react'
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

interface Project {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  author_email: string
  created_at: string
  status: string
}

interface ProjectCardProps {
  project: Project
  pageCount?: number
}

// Determine which tab to open based on project status
function getDefaultTabForStatus(status: string): string {
  // Illustration stages
  const illustrationStatuses = [
    'characters_approved',
    'sketches_review',
    'sketches_revision',
    'illustration_approved',
    'completed',
  ]
  if (illustrationStatuses.includes(status)) {
    return 'illustrations'
  }
  
  // Character stages
  const characterStatuses = [
    'character_review',
    'character_generation',
    'character_approval',
    'character_approval_pending',
    'character_revision_needed',
  ]
  if (characterStatuses.includes(status)) {
    return 'characters'
  }
  
  // Default to pages (draft, or any unknown status)
  return 'pages'
}

export const ProjectCard = memo(function ProjectCard({ project, pageCount = 0 }: ProjectCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

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
            <h2 className="text-xl font-semibold mb-0">{project.book_title}</h2>
            <p className="text-sm text-gray-600">
              By {project.author_firstname} {project.author_lastname} | {pageCount} {pageCount === 1 ? 'Page' : 'Pages'} | Created: {formatDate(project.created_at)}
            </p>
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
