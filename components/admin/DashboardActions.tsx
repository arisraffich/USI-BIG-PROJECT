'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { LineArtModal } from './LineArtModal'

export function DashboardActions() {
    const [lineArtOpen, setLineArtOpen] = useState(false)

    return (
        <>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => setLineArtOpen(true)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Line Art
                </Button>
                <Link href="/admin/project/new">
                    <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        New Project
                    </Button>
                </Link>
            </div>
            <LineArtModal open={lineArtOpen} onOpenChange={setLineArtOpen} />
        </>
    )
}
