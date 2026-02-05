'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ProjectStatus } from '@/types/project'
import { getErrorMessage } from '@/lib/utils/error'

interface ProjectStatusResponse {
  id: string
  book_title: string
  author_firstname: string
  author_lastname: string
  status: ProjectStatus
}

export function useProjectStatus(projectId: string, initialStatus: ProjectStatus) {
  const router = useRouter()
  const [status, setStatus] = useState<ProjectStatus>(initialStatus)
  const [isLoading, setIsLoading] = useState(initialStatus === 'draft')
  const [error, setError] = useState<string | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)
  const consecutiveFailuresRef = useRef(0)
  const maxFailures = 3

  useEffect(() => {
    isMountedRef.current = true
    consecutiveFailuresRef.current = 0
    setError(null)

    // Only poll if status is 'draft' (character identification in progress)
    if (initialStatus === 'draft') {
      setIsLoading(true)

      const pollStatus = async () => {
        if (!isMountedRef.current) return

        try {
          // Add timeout for individual request (5 seconds)
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const response = await fetch(`/api/projects/${projectId}`, {
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            consecutiveFailuresRef.current++
            if (consecutiveFailuresRef.current >= maxFailures) {
              if (isMountedRef.current) {
                setIsLoading(false)
                setError('Failed to check project status. Please refresh the page.')
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current)
                  pollingIntervalRef.current = null
                }
              }
            }
            return
          }

          const data: ProjectStatusResponse = await response.json()

          // Reset failure counter on success
          consecutiveFailuresRef.current = 0

          if (isMountedRef.current) {
            setStatus(data.status)

            // Stop polling when status changes from 'draft' to something else
            if (data.status !== 'draft') {
              setIsLoading(false)
              setError(null)
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
              }
              // Trigger a data refresh to get updated characters, but avoid full page reload loop
              router.refresh()
            }
          }
        } catch (error: unknown) {
          consecutiveFailuresRef.current++
          console.error('Error polling project status:', error)

          if (consecutiveFailuresRef.current >= maxFailures) {
            if (isMountedRef.current) {
              setIsLoading(false)
              setError('Connection error. Please refresh the page.')
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
              }
            }
          }
        }
      }

      // Poll immediately, then every 2.5 seconds
      pollStatus()
      pollingIntervalRef.current = setInterval(pollStatus, 2500)
    } else {
      // Status is already past 'draft', no need to poll
      setStatus(initialStatus)
      setIsLoading(false)
      setError(null)
    }

    return () => {
      isMountedRef.current = false
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [projectId, initialStatus])

  return { status, isLoading, error }
}


