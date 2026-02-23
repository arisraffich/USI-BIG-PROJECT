'use client'

import { useEffect, useState, useCallback } from 'react'

type Status = 'healthy' | 'down' | 'checking' | 'unknown'

interface MonitorResponse {
    status: Status
    isMonitoring: boolean
    lastChecked: string | null
}

const STATUS_CONFIG = {
    healthy: { color: 'bg-emerald-400', label: 'Google AI: Operational' },
    down: { color: 'bg-red-500 animate-pulse', label: 'Google AI: Down — monitoring recovery' },
    checking: { color: 'bg-amber-400 animate-pulse', label: 'Google AI: Checking...' },
    unknown: { color: 'bg-gray-300', label: 'Google AI: Unknown' },
} as const

export function AIStatusDot() {
    const [status, setStatus] = useState<Status>('unknown')
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [showTooltip, setShowTooltip] = useState(false)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/health/google-ai/status')
            if (res.ok) {
                const data: MonitorResponse = await res.json()
                setStatus(data.status)
                setIsMonitoring(data.isMonitoring)
            }
        } catch {
            // silent
        }
    }, [])

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, isMonitoring ? 10_000 : 60_000)
        return () => clearInterval(interval)
    }, [fetchStatus, isMonitoring])

    const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown

    return (
        <div className="relative inline-flex items-center">
            <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="relative flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-100 transition-colors"
                aria-label={config.label}
            >
                <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
            </button>
            {showTooltip && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap z-50 shadow-lg">
                    {config.label}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                </div>
            )}
        </div>
    )
}
