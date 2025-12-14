import { cn } from "@/lib/utils"
import { CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react'
import { ReactNode } from "react"

export type PageStatus = 'resolved' | 'pending' | 'fresh' | 'request'

interface PageStatusBarProps {
    status: PageStatus
    labelText?: string
    onStatusClick: () => void
    actionButton?: ReactNode
    className?: string
}

export function PageStatusBar({
    status,
    labelText,
    onStatusClick,
    actionButton,
    className
}: PageStatusBarProps) {

    // Config based on status
    const styles = {
        resolved: {
            bg: 'bg-emerald-100',
            border: 'border-emerald-200',
            text: 'text-emerald-800',
            icon: CheckCircle2,
            iconColor: 'text-emerald-600'
        },
        pending: { // Review submitted by customer, waiting for admin
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            text: 'text-amber-900',
            icon: MessageSquare,
            iconColor: 'text-amber-600'
        },
        request: { // Admin viewing a request
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            text: 'text-amber-900',
            icon: AlertCircle,
            iconColor: 'text-amber-600'
        },
        fresh: { // No feedback yet, clean state
            bg: 'bg-slate-100',
            border: 'border-slate-200',
            text: 'text-slate-700',
            icon: CheckCircle2,
            iconColor: 'text-slate-400'
        }
    }

    const config = styles[status] || styles.fresh
    const Icon = config.icon

    return (
        <div className={cn("flex items-center justify-between py-3 px-4", className)}>
            {/* Status Pill (Clickable) */}
            <button
                onClick={onStatusClick}
                className={cn(
                    "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all active:scale-95",
                    config.bg, config.border, config.text
                )}
            >
                <Icon className={cn("w-3.5 h-3.5", config.iconColor)} />
                <span className="truncate max-w-[180px] uppercase tracking-wide">
                    {labelText || status}
                </span>
            </button>

            {/* Action Button Slot */}
            {actionButton && (
                <div className="shrink-0 ml-3">
                    {actionButton}
                </div>
            )}
        </div>
    )
}
