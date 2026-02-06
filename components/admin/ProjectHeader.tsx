'use client'

import { SharedProjectHeader } from '@/components/layout/SharedProjectHeader'
import { useTransition, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Home, Loader2, Send, FileText, Sparkles, Download, ExternalLink, Info, Upload, Palette, Pencil, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
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
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import JSZip from 'jszip'
import { ProjectStatus } from '@/types/project'
import { useProjectStatus } from '@/hooks/use-project-status'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { BADGE_COLORS } from '@/lib/constants/statusBadgeConfig'
import { getErrorMessage } from '@/lib/utils/error'

interface ProjectInfo {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  status: ProjectStatus
  character_send_count?: number
  illustration_send_count?: number
  review_token?: string | null
  send_count?: number
  show_colored_to_customer?: boolean
}

interface ProjectHeaderProps {
  projectId: string
  projectInfo: ProjectInfo
  pageCount: number
  characterCount: number
  hasImages?: boolean
  isTrialReady?: boolean
  onCreateIllustrations?: () => void
  generatedIllustrationCount?: number
  centerContent?: React.ReactNode
  hasUnresolvedFeedback?: boolean
  hasResolvedFeedback?: boolean
}

// Define clear stage configuration
interface StageConfig {
  tag: string
  tagStyle: string
  buttonLabel: string
  showCount: boolean
  isResend: boolean
  buttonDisabled: boolean
  isDownload?: boolean
}

// Helper to check if in illustration workflow phase
function isInIllustrationPhase(status: ProjectStatus): boolean {
  return [
    'characters_approved',
    'sketches_review', 'sketches_revision',
    'illustration_approved',
    // Legacy statuses (for migration compatibility)
    'trial_review', 'trial_revision', 'trial_approved',
    'illustrations_generating',
    'illustration_review', 'illustration_revision_needed'
  ].includes(status)
}

export function ProjectHeader({ projectId, projectInfo, pageCount, characterCount, hasImages = false, isTrialReady = false, onCreateIllustrations, generatedIllustrationCount = 0, centerContent, hasUnresolvedFeedback = false, hasResolvedFeedback = false }: ProjectHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [isSendingToCustomer, setIsSendingToCustomer] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  // Settings state
  const [showColoredToCustomer, setShowColoredToCustomer] = useState(projectInfo.show_colored_to_customer ?? false)
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false)
  
  // Push & Coloring Request state
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isSendingColoringRequest, setIsSendingColoringRequest] = useState(false)
  
  // Line Art Download state
  const [isDownloadingLineArt, setIsDownloadingLineArt] = useState(false)
  const [lineArtModal, setLineArtModal] = useState<{
    open: boolean
    phase: 'generating' | 'zipping' | 'done' | 'error'
    total: number
    successCount: number
    failedPages: number[]
    retryingPages: number[]
    message: string
  }>({
    open: false,
    phase: 'generating',
    total: 0,
    successCount: 0,
    failedPages: [],
    retryingPages: [],
    message: '',
  })

  // Refs for storing blobs (don't trigger re-renders)
  const lineArtBlobsRef = useRef<Map<number, Blob>>(new Map())
  const illustrationPagesRef = useRef<Array<{ page_number: number; illustration_url: string }>>([])

  // Email & Line Art status state
  const [isSendingSketchesEmail, setIsSendingSketchesEmail] = useState(false)
  const [isSendingLineArtEmail, setIsSendingLineArtEmail] = useState(false)
  const [isDownloadingExistingLineArt, setIsDownloadingExistingLineArt] = useState(false)
  const [hasLineArtInStorage, setHasLineArtInStorage] = useState(false)

  // Hydration fix
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Sync settings state when projectInfo changes
  useEffect(() => {
    setShowColoredToCustomer(projectInfo.show_colored_to_customer ?? false)
  }, [projectInfo.show_colored_to_customer])

  // Check if line art exists in storage (for showing/enabling buttons)
  useEffect(() => {
    if (projectInfo.status === 'illustration_approved') {
      fetch(`/api/line-art/status?projectId=${projectId}`)
        .then(res => res.json())
        .then(data => setHasLineArtInStorage(data.hasLineArt || false))
        .catch(() => setHasLineArtInStorage(false))
    }
  }, [projectId, projectInfo.status])
  
  // Handle toggle for showing colored images to customer
  const handleToggleColoredImages = async (checked: boolean) => {
    setIsUpdatingSettings(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_colored_to_customer: checked })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update settings')
      }
      
      setShowColoredToCustomer(checked)
      toast.success(
        checked 
          ? 'Colored images now visible to customer' 
          : 'Colored images hidden from customer',
        { duration: 3000 }
      )
      router.refresh()
    } catch (error: unknown) {
      toast.error('Failed to update settings', {
        description: getErrorMessage(error, 'An error occurred')
      })
      // Revert the toggle
      setShowColoredToCustomer(!checked)
    } finally {
      setIsUpdatingSettings(false)
    }
  }
  
  // Handle opening customer view
  const handleOpenCustomerView = () => {
    if (projectInfo.review_token) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
      const customerUrl = `${baseUrl}/review/${projectInfo.review_token}?tab=illustrations`
      window.open(customerUrl, '_blank')
    }
  }

  // Push to Customer (Silent Update) - Illustrations
  const handlePushToCustomer = async () => {
    setIsPushing(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/push-to-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Push failed')
      }
      
      const result = await response.json()
      toast.success(result.message || 'Changes pushed to customer')
      setIsPushDialogOpen(false)
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'Failed to push changes'))
    } finally {
      setIsPushing(false)
    }
  }

  // Send Page 1 Coloring Request
  const handleSendColoringRequest = async () => {
    setIsSendingColoringRequest(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/send-karine-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send request')
      }
      
      toast.success('Coloring request sent')
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'Failed to send request'))
    } finally {
      setIsSendingColoringRequest(false)
    }
  }

  const status = projectInfo.status
  const sendCount = projectInfo.illustration_send_count || 0

  // ------------------------------------------------------------------
  // STAGE CONFIGURATION LOGIC - ILLUSTRATION WORKFLOW
  // ------------------------------------------------------------------
  const getStageConfig = (): StageConfig => {
    // ============================================================
    // ILLUSTRATION PHASE STAGES (Simplified - No Trial)
    // ============================================================
    // Flow: characters_approved → [generate all] → sketches_review → illustration_approved

    // STAGE: Characters Approved → Ready to generate all pages
    // Admin generates page 1 first, then rest. Button disabled until ALL generated.
    if (status === 'characters_approved' || 
        // Legacy statuses: treat as "generating" phase
        status === 'trial_review' || status === 'trial_revision' || 
        status === 'trial_approved' || status === 'illustrations_generating') {
      const allPagesGenerated = generatedIllustrationCount >= pageCount
      const page1Generated = generatedIllustrationCount >= 1
      
      let tag = 'Ready to Generate'
      let tagStyle: string = BADGE_COLORS.BLUE
      
      if (page1Generated && !allPagesGenerated) {
        tag = 'Generating...'
        tagStyle = BADGE_COLORS.PURPLE
      } else if (allPagesGenerated) {
        tag = 'Sketches Ready'
        tagStyle = BADGE_COLORS.PURPLE
      }
      
      return {
        tag,
        tagStyle,
        buttonLabel: 'Send Sketches',
        showCount: false,
        isResend: false,
        buttonDisabled: !allPagesGenerated
      }
    }

    // STAGE: All sketches sent, waiting for customer review
    // (Legacy: illustration_review)
    if (status === 'sketches_review' || status === 'illustration_review') {
      return {
        tag: hasUnresolvedFeedback ? 'Sketches Feedback' : 'Wait: Sketches Review',
        tagStyle: hasUnresolvedFeedback 
          ? BADGE_COLORS.AMBER 
          : BADGE_COLORS.PURPLE,
        buttonLabel: 'Resend Sketches',
        showCount: true,
        isResend: true,
        buttonDisabled: !hasResolvedFeedback
      }
    }

    // STAGE: Customer requested sketches revision
    // (Legacy: illustration_revision_needed)
    if (status === 'sketches_revision' || status === 'illustration_revision_needed') {
      return {
        tag: 'Sketches Feedback',
        tagStyle: BADGE_COLORS.ORANGE,
        buttonLabel: 'Resend Sketches',
        showCount: true,
        isResend: true,
        buttonDisabled: !hasResolvedFeedback
      }
    }

    // STAGE: All sketches approved - FINAL
    if (status === 'illustration_approved') {
      return {
        tag: 'Sketches Approved',
        tagStyle: BADGE_COLORS.GREEN,
        buttonLabel: 'Download Illustrations',
        showCount: false,
        isResend: false,
        buttonDisabled: false,
        isDownload: true
      }
    }

    // ============================================================
    // CHARACTER PHASE STAGES
    // ============================================================
    const charSendCount = projectInfo.character_send_count || 0

    // Waiting for customer character review
    if (status === 'character_review' && charSendCount > 0) {
      return {
        tag: hasUnresolvedFeedback ? 'Customer Feedback Received' : 'Waiting for Review',
        tagStyle: hasUnresolvedFeedback ? BADGE_COLORS.CYAN_80 : BADGE_COLORS.CYAN_60,
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: !hasUnresolvedFeedback
      }
    }

    // Characters regenerated, ready to resend
    if (status === 'characters_regenerated') {
      if (charSendCount === 0) {
        return {
          tag: 'Characters Generated',
          tagStyle: BADGE_COLORS.CYAN_40,
          buttonLabel: 'Send Characters',
          showCount: false,
          isResend: false,
          buttonDisabled: false
        }
      } else {
        return {
          tag: 'Characters Regenerated',
          tagStyle: BADGE_COLORS.CYAN_60,
          buttonLabel: 'Resend Characters',
          showCount: true,
          isResend: true,
          buttonDisabled: false
        }
      }
    }

    // Customer requested character revision
    if (status === 'character_revision_needed') {
      return {
        tag: 'Regenerate Characters',
        tagStyle: BADGE_COLORS.CYAN_80,
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: true
      }
    }

    // Generating characters
    if (status === 'character_generation') {
      return {
        tag: 'Generating Characters',
        tagStyle: BADGE_COLORS.CYAN_40,
        buttonLabel: charSendCount > 0 ? 'Resend Characters' : 'Send Characters',
        showCount: charSendCount > 0,
        isResend: charSendCount > 0,
        buttonDisabled: true
      }
    }

    // Characters generation complete
    if (status === 'character_generation_complete') {
      if (charSendCount > 0) {
        return {
          tag: 'Characters Regenerated',
          tagStyle: BADGE_COLORS.CYAN_60,
          buttonLabel: 'Resend Characters',
          showCount: true,
          isResend: true,
          buttonDisabled: false
        }
      }
      return {
        tag: 'Characters Generated',
        tagStyle: BADGE_COLORS.CYAN_40,
        buttonLabel: 'Send Characters',
        showCount: false,
        isResend: false,
        buttonDisabled: false
      }
    }

    // Has images but never sent
    if (hasImages && charSendCount === 0) {
      return {
        tag: 'Characters Generated',
        tagStyle: BADGE_COLORS.CYAN_40,
        buttonLabel: 'Send Characters',
        showCount: false,
        isResend: false,
        buttonDisabled: false
      }
    }
    
    // Has images and already sent
    if (hasImages && charSendCount > 0) {
      return {
        tag: 'Characters Ready',
        tagStyle: BADGE_COLORS.CYAN_60,
        buttonLabel: 'Resend Characters',
        showCount: true,
        isResend: true,
        buttonDisabled: false
      }
    }

    // Default: Project setup
    return {
      tag: 'Project Setup',
      tagStyle: BADGE_COLORS.OUTLINE,
      buttonLabel: 'Request Input',
      showCount: false,
      isResend: false,
      buttonDisabled: false
    }
  }

  const stage = getStageConfig()
  
  // For character phase, use character_send_count for display
  // For illustration phase, show revision round (sendCount - 1 for resends, since first send = round 0)
  const displayCount = isInIllustrationPhase(status) 
    ? Math.max(0, sendCount - 1) // Revision rounds start from 0
    : (projectInfo.character_send_count || 0)
  
  const buttonDisplayLabel = isSendingToCustomer 
    ? 'Sending...' 
    : isDownloading 
      ? 'Downloading...' 
      : stage.buttonLabel

  // Realtime Subscription for Admin Status Updates
  useEffect(() => {
    const supabase = createClient()
    const channelName = `admin-project-status-${projectId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`
        },
        (payload) => {
          const newProject = payload.new as any
          const oldProject = payload.old as any
          
          // Only refresh when status actually changes
          if (oldProject?.status !== newProject.status) {
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, router])

  // Poll project status to detect when character identification completes
  const { status: currentStatus, isLoading: isCharactersLoading } = useProjectStatus(
    projectId,
    projectInfo.status
  )

  // Read active tab from search params
  const activeTab = searchParams?.get('tab') || 'pages'

  // Check if Illustrations tab is unlocked
  const isIllustrationsUnlocked = isInIllustrationPhase(status)

  const handleTabClick = (tab: 'pages' | 'characters' | 'illustrations', e?: React.MouseEvent) => {
    if (e) e.preventDefault()
    if (tab === 'characters' && isCharactersLoading) return

    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('tab', tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const handleDownloadIllustrations = async () => {
    if (isDownloading) return

    setIsDownloading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/download-illustrations`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download illustrations')
      }

      const blob = await response.blob()
      
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'illustrations.zip'
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Download started!', {
        description: `Downloading ${filename}`,
      })
    } catch (error: unknown) {
      toast.error('Failed to download illustrations', {
        description: getErrorMessage(error, 'An error occurred'),
      })
    } finally {
      setIsDownloading(false)
    }
  }

  // Build ZIP and trigger download (used from modal buttons and settings download)
  const buildAndDownloadZip = useCallback(async () => {
    setLineArtModal(prev => ({ ...prev, phase: 'zipping', message: 'Creating ZIP file...' }))

    try {
      const zip = new JSZip()
      const lineArtFolder = zip.folder('Line Art')!
      const illustrationsFolder = zip.folder('Color References')!

      // Add all collected line art blobs
      for (const [pageNumber, blob] of lineArtBlobsRef.current) {
        lineArtFolder.file(`lineart ${pageNumber}.png`, blob)
      }

      // Fetch illustrations concurrently (bounded to 5)
      const pages = [...illustrationPagesRef.current]
      const illustrationQueue = [...pages]
      const fetchIllustration = async () => {
        while (illustrationQueue.length > 0) {
          const page = illustrationQueue.shift()!
          try {
            const res = await fetch(page.illustration_url)
            if (res.ok) {
              const blob = await res.blob()
              illustrationsFolder.file(`illustration ${page.page_number}.png`, blob)
            }
          } catch {
            // Non-critical: skip failed illustration downloads
          }
        }
      }
      const illWorkers = Array(Math.min(5, pages.length))
        .fill(null)
        .map(() => fetchIllustration())
      await Promise.all(illWorkers)

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      const safeTitle = (projectInfo.book_title || 'line-art')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .trim()

      const url = window.URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeTitle}_LineArt.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      setHasLineArtInStorage(true)
      setLineArtModal(prev => ({
        ...prev,
        phase: 'done',
        message: `All ${prev.successCount} line arts downloaded!`,
      }))
    } catch (error: unknown) {
      setLineArtModal(prev => ({
        ...prev,
        phase: 'error',
        message: getErrorMessage(error, 'Failed to create ZIP'),
      }))
    }
  }, [projectInfo.book_title])

  // Download existing line art from storage (no generation, for settings button)
  const handleDownloadExistingLineArt = useCallback(async () => {
    if (isDownloadingExistingLineArt) return
    setIsDownloadingExistingLineArt(true)

    try {
      // Fetch line art status to get URLs
      const statusRes = await fetch(`/api/line-art/status?projectId=${projectId}`)
      const statusData = await statusRes.json()

      if (!statusData.hasLineArt) {
        toast.error('No line art found. Generate line art first.')
        return
      }

      // Fetch pages for illustrations
      const supabase = createClient()
      const { data: pages } = await supabase
        .from('pages')
        .select('page_number, illustration_url')
        .eq('project_id', projectId)
        .not('illustration_url', 'is', null)
        .order('page_number', { ascending: true })

      if (!pages || pages.length === 0) {
        toast.error('No pages found')
        return
      }

      toast.info('Preparing download...')

      const zip = new JSZip()
      const lineArtFolder = zip.folder('Line Art')!
      const illustrationsFolder = zip.folder('Color References')!

      // Fetch line art files from storage
      const lineArtUrls = statusData.urls || []
      const downloadPromises: Promise<void>[] = []

      for (const file of lineArtUrls) {
        downloadPromises.push(
          fetch(file.url)
            .then(async (res) => {
              if (res.ok) {
                const blob = await res.blob()
                lineArtFolder.file(`lineart ${file.pageNumber}.png`, blob)
              }
            })
            .catch(() => {})
        )
      }

      // Fetch illustrations
      for (const page of pages) {
        if (page.illustration_url) {
          downloadPromises.push(
            fetch(page.illustration_url)
              .then(async (res) => {
                if (res.ok) {
                  const blob = await res.blob()
                  illustrationsFolder.file(`illustration ${page.page_number}.png`, blob)
                }
              })
              .catch(() => {})
          )
        }
      }

      await Promise.all(downloadPromises)

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const safeTitle = (projectInfo.book_title || 'line-art')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .trim()

      const url = window.URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeTitle}_LineArt.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Download started!')
    } catch (error: unknown) {
      toast.error('Failed to download', { description: getErrorMessage(error) })
    } finally {
      setIsDownloadingExistingLineArt(false)
    }
  }, [projectId, projectInfo.book_title, isDownloadingExistingLineArt])

  // Retry a single failed page
  const handleRetryPage = useCallback(async (pageNumber: number) => {
    // Find illustration URL for this page
    const page = illustrationPagesRef.current.find(p => p.page_number === pageNumber)
    if (!page) return

    // Mark as retrying
    setLineArtModal(prev => ({
      ...prev,
      retryingPages: [...prev.retryingPages, pageNumber],
    }))

    try {
      const response = await fetch('/api/line-art/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          illustrationUrl: page.illustration_url,
          pageNumber,
          projectId,
        }),
      })

      if (!response.ok) {
        throw new Error(`Page ${pageNumber} failed`)
      }

      const blob = await response.blob()
      lineArtBlobsRef.current.set(pageNumber, blob)

      // Update state: remove from failed + retrying, increment success
      setLineArtModal(prev => {
        const newFailed = prev.failedPages.filter(p => p !== pageNumber)
        const newRetrying = prev.retryingPages.filter(p => p !== pageNumber)
        const newSuccessCount = prev.successCount + 1

        if (newFailed.length === 0) {
          setHasLineArtInStorage(true)
        }

        return {
          ...prev,
          phase: newFailed.length === 0 ? 'done' : prev.phase,
          successCount: newSuccessCount,
          failedPages: newFailed,
          retryingPages: newRetrying,
          message: newFailed.length === 0
            ? `All ${newSuccessCount} line arts generated!`
            : `${newSuccessCount} of ${prev.total} generated, ${newFailed.length} remaining`,
        }
      })
    } catch {
      // Remove from retrying but keep in failed
      setLineArtModal(prev => ({
        ...prev,
        retryingPages: prev.retryingPages.filter(p => p !== pageNumber),
        message: `Page ${pageNumber} failed again. Try once more.`,
      }))
    }
  }, [projectId])

  const handleDownloadLineArt = async () => {
    if (isDownloadingLineArt) return

    setIsDownloadingLineArt(true)
    lineArtBlobsRef.current = new Map()
    illustrationPagesRef.current = []

    setLineArtModal({
      open: true,
      phase: 'generating',
      total: 0,
      successCount: 0,
      failedPages: [],
      retryingPages: [],
      message: 'Fetching pages...',
    })

    try {
      // Step 1: Fetch all pages with illustrations
      const supabase = createClient()
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('id, page_number, illustration_url')
        .eq('project_id', projectId)
        .not('illustration_url', 'is', null)
        .order('page_number', { ascending: true })

      if (pagesError || !pages || pages.length === 0) {
        throw new Error('No illustrated pages found')
      }

      // Store pages for retry + illustration fetching
      illustrationPagesRef.current = pages.map(p => ({
        page_number: p.page_number,
        illustration_url: p.illustration_url!,
      }))

      const total = pages.length
      let successCount = 0
      const failedPages: number[] = []

      setLineArtModal(prev => ({ ...prev, total, message: `Generating line art 0/${total}...` }))

      // Step 2: Generate line art for each page (3 concurrent)
      const MAX_CONCURRENT = 3
      const queue = [...pages]

      const processNext = async () => {
        while (queue.length > 0) {
          const page = queue.shift()!
          try {
            const response = await fetch('/api/line-art/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                illustrationUrl: page.illustration_url,
                pageNumber: page.page_number,
                projectId,
              }),
            })

            if (!response.ok) {
              throw new Error(`Page ${page.page_number} failed`)
            }

            const blob = await response.blob()
            lineArtBlobsRef.current.set(page.page_number, blob)
            successCount++
          } catch {
            failedPages.push(page.page_number)
          }

          const processed = successCount + failedPages.length
          setLineArtModal(prev => ({
            ...prev,
            successCount,
            failedPages: [...failedPages],
            message: `Generating line art ${processed}/${total}...`,
          }))
        }
      }

      const workers = Array(Math.min(MAX_CONCURRENT, pages.length))
        .fill(null)
        .map(() => processNext())
      await Promise.all(workers)

      setIsDownloadingLineArt(false)

      if (lineArtBlobsRef.current.size === 0) {
        throw new Error('All line art generations failed')
      }

      // Step 3: If no failures, show done state with Download/Email buttons. Otherwise show retry UI.
      if (failedPages.length === 0) {
        setHasLineArtInStorage(true)
        setLineArtModal(prev => ({
          ...prev,
          phase: 'done',
          message: `All ${successCount} line arts generated!`,
        }))
      } else {
        setLineArtModal(prev => ({
          ...prev,
          phase: 'generating', // Stay in generating phase to show retry UI
          message: `${successCount} of ${total} generated, ${failedPages.length} failed`,
        }))
      }

    } catch (error: unknown) {
      setIsDownloadingLineArt(false)
      setLineArtModal(prev => ({
        ...prev,
        phase: 'error',
        message: getErrorMessage(error, 'An unexpected error occurred'),
      }))
    }
  }

  // Email handlers
  const handleEmailSketches = async () => {
    if (isSendingSketchesEmail) return
    setIsSendingSketchesEmail(true)
    try {
      const response = await fetch('/api/email/send-sketches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send email')
      }
      toast.success('Sketches emailed!', { description: 'Sent to info@usillustrations.com' })
    } catch (error: unknown) {
      toast.error('Failed to send email', { description: getErrorMessage(error) })
    } finally {
      setIsSendingSketchesEmail(false)
    }
  }

  const handleEmailLineArt = async () => {
    if (isSendingLineArtEmail) return
    setIsSendingLineArtEmail(true)
    try {
      const response = await fetch('/api/email/send-lineart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send email')
      }
      toast.success('Line art emailed!', { description: 'Sent to info@usillustrations.com' })
    } catch (error: unknown) {
      toast.error('Failed to send email', { description: getErrorMessage(error) })
    } finally {
      setIsSendingLineArtEmail(false)
    }
  }

  const handleSendToCustomer = async () => {
    if (stage.buttonDisabled || isSendingToCustomer) return

    if (stage.buttonLabel === 'Create Illustrations') {
      if (onCreateIllustrations) {
        onCreateIllustrations()
      } else {
        toast.info("Illustration setup is coming soon")
      }
      return
    }

    setIsSendingToCustomer(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/send-to-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send project to customer')
      }

      const data = await response.json()
      toast.success(stage.isResend ? 'Project resent to customer' : 'Project sent to customer review', {
        description: `Review URL: ${data.reviewUrl}`,
      })
      
      router.refresh()
    } catch (error: unknown) {
      toast.error('Failed to send project to customer', {
        description: getErrorMessage(error, 'An error occurred'),
      })
    } finally {
      setIsSendingToCustomer(false)
    }
  }

  const handleDashboardClick = () => router.push('/admin/dashboard')

  // Determine current tab for display
  const currentTab = activeTab || (isIllustrationsUnlocked ? 'illustrations' : 'pages')

  // Construct Tabs
  const tabs: Array<{
    id: string
    label: string
    icon: React.ReactNode
    onClick: () => void
    count: number
    disabled?: boolean
  }> = [
    {
      id: 'pages',
      label: 'Pages',
      icon: <FileText className="w-4 h-4" />,
      onClick: () => handleTabClick('pages'),
      count: pageCount
    }
  ]

  // Only show Characters tab if there are secondary characters (count > 1 means main + secondary)
  if (characterCount > 1) {
    tabs.push({
      id: 'characters',
      label: 'Characters',
      icon: <Loader2 className="w-4 h-4" />,
      onClick: () => handleTabClick('characters'),
      count: characterCount,
      disabled: isCharactersLoading
    })
  }

  if (isIllustrationsUnlocked) {
    tabs.push({
      id: 'illustrations',
      label: 'Illustrations',
      icon: <Sparkles className="w-4 h-4 text-purple-600" />,
      onClick: () => handleTabClick('illustrations'),
      count: 0
    })
  }

  return (
    <>
    <SharedProjectHeader
      projectTitle={projectInfo.book_title}
      authorName={`${projectInfo.author_firstname} ${projectInfo.author_lastname}'s Project`}
      currentTabId={currentTab}
      tabs={tabs}
      dashboardLink={{
        label: 'Dashboard',
        href: '/admin/dashboard',
        icon: <Home className="w-4 h-4" />,
        onClick: handleDashboardClick
      }}
      centerContent={centerContent}
      statusTag={
        <span className={`hidden md:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${stage.tagStyle} shadow-sm`}>
          {stage.tag}
        </span>
      }
      showSettings={true}
      settingsContent={
        <>
          {/* Customer View Button */}
          {projectInfo.review_token && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-9"
              onClick={handleOpenCustomerView}
            >
              <ExternalLink className="w-4 h-4" />
              Open Customer View
            </Button>
          )}
          
          {/* Divider */}
          <div className="h-px bg-slate-100" />
          
          {/* Push Changes Button - Only show after illustrations sent */}
          {(projectInfo.illustration_send_count || 0) > 0 && (
            <div className="space-y-1.5">
              <AlertDialog open={isPushDialogOpen} onOpenChange={setIsPushDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 h-9"
                  >
                    <Upload className="w-4 h-4" />
                    Push Changes
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Push Changes to Customer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will silently update all illustrations on the customer&apos;s side without sending any notifications. The customer will see the latest versions when they refresh or revisit the page.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPushing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handlePushToCustomer}
                      disabled={isPushing}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isPushing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Pushing...
                        </>
                      ) : (
                        'Push Changes'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <p className="text-xs text-slate-500 flex items-start gap-1.5 px-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Silently update customer&apos;s illustrations without email.</span>
              </p>
            </div>
          )}
          
          {/* Request Page 1 Coloring - Only show when illustrations exist */}
          {generatedIllustrationCount > 0 && (
            <div className="space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-9 border-purple-300 bg-purple-50 hover:bg-purple-100 hover:border-purple-400"
                onClick={handleSendColoringRequest}
                disabled={isSendingColoringRequest}
              >
                {isSendingColoringRequest ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Palette className="w-4 h-4 text-purple-600" />
                )}
                Request Page 1 Coloring
              </Button>
              <p className="text-xs text-slate-500 flex items-start gap-1.5 px-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Send Page 1 sketch for coloring.</span>
              </p>
            </div>
          )}
          
          {/* Divider before toggle */}
          <div className="h-px bg-slate-100" />
          
          {/* Show Colored Images Toggle */}
          <div className="space-y-2 px-1">
            <div className="flex items-center justify-between">
              <label htmlFor="show-colored" className="text-sm font-medium text-slate-700">
                Show Colored Images
              </label>
              <Switch
                id="show-colored"
                checked={showColoredToCustomer}
                onCheckedChange={handleToggleColoredImages}
                disabled={isUpdatingSettings}
              />
            </div>
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>Customers can see colored illustrations.</span>
            </p>
          </div>

          {/* Downloads & Email section - only after approval */}
          {stage.isDownload && (
            <>
              <div className="h-px bg-slate-100" />
              
              {/* Downloads */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">Downloads</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 h-9"
                  onClick={handleDownloadIllustrations}
                  disabled={isDownloading || isSendingSketchesEmail || isSendingLineArtEmail}
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-blue-600" />
                  )}
                  Download Sketches
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 h-9"
                  onClick={handleDownloadExistingLineArt}
                  disabled={!hasLineArtInStorage || isDownloadingExistingLineArt || isDownloading || isSendingSketchesEmail || isSendingLineArtEmail}
                  title={!hasLineArtInStorage ? 'Generate line art first' : 'Download line art from storage'}
                >
                  {isDownloadingExistingLineArt ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className={cn("w-4 h-4", hasLineArtInStorage ? "text-purple-600" : "text-slate-300")} />
                  )}
                  Download Line Art
                </Button>
                {!hasLineArtInStorage && (
                  <p className="text-[10px] text-slate-400 px-1">Generate line art first to enable download.</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">Email to info@</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 h-9"
                  onClick={handleEmailSketches}
                  disabled={isSendingSketchesEmail || isSendingLineArtEmail || isDownloading || isDownloadingLineArt}
                >
                  {isSendingSketchesEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 text-blue-600" />
                  )}
                  Email Sketches
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 h-9"
                  onClick={handleEmailLineArt}
                  disabled={!hasLineArtInStorage || isSendingSketchesEmail || isSendingLineArtEmail || isDownloading || isDownloadingLineArt}
                  title={!hasLineArtInStorage ? 'Generate line art first' : 'Email line art to info@usillustrations.com'}
                >
                  {isSendingLineArtEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className={cn("w-4 h-4", hasLineArtInStorage ? "text-purple-600" : "text-slate-300")} />
                  )}
                  Email Line Art
                </Button>
                {!hasLineArtInStorage && (
                  <p className="text-[10px] text-slate-400 px-1">Generate line art first to enable email.</p>
                )}
              </div>
            </>
          )}
        </>
      }
      actions={
        !stage.isDownload ? (
          <Button
            onClick={handleSendToCustomer}
            disabled={isSendingToCustomer || isDownloading || stage.buttonDisabled}
            size="sm"
            className={`flex px-3 md:px-4 ${stage.buttonDisabled ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none' : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'} font-semibold transition-all duration-75 rounded-md whitespace-nowrap items-center justify-center h-9`}
          >
            <Send className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">{buttonDisplayLabel}</span>
            <span className="md:hidden">Send</span>

            {stage.showCount && !isSendingToCustomer && displayCount > 0 && (
              <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-green-700">
                {displayCount}
              </span>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleDownloadLineArt}
            disabled={isDownloadingLineArt || isSendingSketchesEmail || isSendingLineArtEmail}
            size="sm"
            className="flex px-3 md:px-4 bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg font-semibold transition-all duration-75 rounded-md whitespace-nowrap items-center justify-center h-9"
          >
            {isDownloadingLineArt ? (
              <Loader2 className="w-4 h-4 md:mr-2 animate-spin" />
            ) : (
              <Pencil className="w-4 h-4 md:mr-2" />
            )}
            <span className="hidden md:inline">{isDownloadingLineArt ? 'Generating...' : 'Generate Line Art'}</span>
            <span className="md:hidden">Line Art</span>
          </Button>
        )
      }
    />

    {/* Line Art Progress Modal */}
    <Dialog open={lineArtModal.open} onOpenChange={(open) => {
      // Allow closing when done, error, or showing retry UI (not during active generation/zipping)
      const canClose = lineArtModal.phase === 'done' || lineArtModal.phase === 'error' || 
        (lineArtModal.failedPages.length > 0 && !isDownloadingLineArt && lineArtModal.retryingPages.length === 0 && lineArtModal.phase !== 'zipping')
      if (!open && canClose) {
        setLineArtModal(prev => ({ ...prev, open: false }))
      }
    }}>
      <DialogContent
        showCloseButton={lineArtModal.phase === 'done' || lineArtModal.phase === 'error' || (lineArtModal.failedPages.length > 0 && !isDownloadingLineArt && lineArtModal.retryingPages.length === 0)}
        onInteractOutside={(e) => {
          const canClose = lineArtModal.phase === 'done' || lineArtModal.phase === 'error' || 
            (lineArtModal.failedPages.length > 0 && !isDownloadingLineArt && lineArtModal.retryingPages.length === 0 && lineArtModal.phase !== 'zipping')
          if (!canClose) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          const canClose = lineArtModal.phase === 'done' || lineArtModal.phase === 'error' || 
            (lineArtModal.failedPages.length > 0 && !isDownloadingLineArt && lineArtModal.retryingPages.length === 0 && lineArtModal.phase !== 'zipping')
          if (!canClose) e.preventDefault()
        }}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lineArtModal.phase === 'done' ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Line Art Complete
              </>
            ) : lineArtModal.phase === 'error' ? (
              <>
                <XCircle className="w-5 h-5 text-red-600" />
                Generation Failed
              </>
            ) : lineArtModal.phase === 'zipping' ? (
              <>
                <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                Preparing Download
              </>
            ) : lineArtModal.failedPages.length > 0 && !isDownloadingLineArt ? (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Some Pages Failed
              </>
            ) : (
              <>
                <Pencil className="w-5 h-5 text-purple-600" />
                Generating Line Art
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {lineArtModal.phase === 'done'
              ? 'Line art generation complete. Download or email the results.'
              : lineArtModal.phase === 'error'
              ? 'Something went wrong during generation.'
              : lineArtModal.phase === 'zipping'
              ? 'Building your ZIP file...'
              : lineArtModal.failedPages.length > 0 && !isDownloadingLineArt
              ? 'Retry failed pages or download what succeeded.'
              : 'Please wait while line art is being generated.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress Bar */}
          {lineArtModal.total > 0 && lineArtModal.phase !== 'error' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>{lineArtModal.successCount} of {lineArtModal.total} generated</span>
                <span className="font-medium">
                  {Math.round((lineArtModal.successCount / lineArtModal.total) * 100)}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    lineArtModal.phase === 'done' ? 'bg-green-500' : 'bg-purple-500'
                  )}
                  style={{
                    width: `${lineArtModal.total > 0 ? (lineArtModal.successCount / lineArtModal.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Status Message */}
          <div className={cn(
            "flex items-center gap-2 text-sm",
            lineArtModal.phase === 'error' ? 'text-red-600' : 'text-slate-600'
          )}>
            {isDownloadingLineArt || lineArtModal.retryingPages.length > 0 || lineArtModal.phase === 'zipping' ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-500 shrink-0" />
            ) : null}
            <span>{lineArtModal.message}</span>
          </div>

          {/* Failed pages with retry buttons */}
          {lineArtModal.failedPages.length > 0 && !isDownloadingLineArt && lineArtModal.phase !== 'done' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Failed pages</p>
              <div className="flex flex-wrap gap-2">
                {lineArtModal.failedPages.map(pageNum => {
                  const isRetrying = lineArtModal.retryingPages.includes(pageNum)
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handleRetryPage(pageNum)}
                      disabled={isRetrying}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                        isRetrying
                          ? "bg-purple-50 text-purple-400 cursor-wait"
                          : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 hover:border-red-300"
                      )}
                    >
                      {isRetrying ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Page {pageNum}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Download button (when there are failures but some succeeded) */}
          {lineArtModal.failedPages.length > 0 && !isDownloadingLineArt && lineArtModal.successCount > 0 && lineArtModal.phase !== 'done' && lineArtModal.phase !== 'zipping' && lineArtModal.retryingPages.length === 0 && (
            <Button
              onClick={buildAndDownloadZip}
              size="sm"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
            >
              <Download className="w-4 h-4 mr-2" />
              Download {lineArtModal.successCount} Line Arts
            </Button>
          )}

          {/* Done state: Download + Email buttons */}
          {lineArtModal.phase === 'done' && (
            <div className="flex gap-2">
              <Button
                onClick={buildAndDownloadZip}
                size="sm"
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Line Art
              </Button>
              <Button
                onClick={() => {
                  handleEmailLineArt()
                }}
                size="sm"
                disabled={isSendingLineArtEmail}
                variant="outline"
                className="flex-1 border-purple-300 hover:bg-purple-50"
              >
                {isSendingLineArtEmail ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2 text-purple-600" />
                )}
                Email Line Art
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    </>
  )
}
