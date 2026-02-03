'use client'

import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

interface AdminCustomerViewButtonProps {
    reviewToken: string
}

export function AdminCustomerViewButton({ reviewToken }: AdminCustomerViewButtonProps) {
    const handleOpenCustomerView = () => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
        const customerUrl = `${baseUrl}/review/${reviewToken}?tab=illustrations`
        window.open(customerUrl, '_blank')
    }

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-white shadow-lg border-slate-300 hover:bg-slate-50"
                onClick={handleOpenCustomerView}
            >
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Customer View
            </Button>
        </div>
    )
}
