'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RotateCcw, ShieldAlert } from 'lucide-react'

interface ProjectDevToolsProps {
    projectId: string
}

export function ProjectDevTools({ projectId }: ProjectDevToolsProps) {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    // Only show in development (or if explicitly enabled via param/env)
    // For now we rely on the implementation context where this is used.

    const handleReset = async () => {
        if (!confirm('WARNING: This will RESET the illustration status and DELETE all generated image references from the database. Are you sure?')) {
            return
        }

        setIsLoading(true)
        try {
            const response = await fetch('/api/devtools/reset-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId })
            })

            if (!response.ok) throw new Error('Reset failed')

            toast.success('Project Reset Successfully', { description: 'Ready to test flow again.' })
            router.refresh()

            // Force reload to clear client cache if needed
            setTimeout(() => window.location.reload(), 500)

        } catch (error) {
            toast.error('Reset Failed')
        } finally {
            setIsLoading(false)
        }
    }

    if (process.env.NODE_ENV !== 'development') return null

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="bg-slate-900/90 text-white p-2 rounded-lg shadow-2xl border border-slate-700 backdrop-blur-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-mono font-bold text-slate-400">DEV TOOLS</span>
                <div className="h-4 w-px bg-slate-700 mx-1"></div>
                <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleReset}
                    disabled={isLoading}
                >
                    <RotateCcw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                    Reset Workflow
                </Button>
            </div>
        </div>
    )
}
