'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Menu, X, Settings, BookImage, Sparkles } from 'lucide-react'
import { LineArtModal } from './LineArtModal'
import { CoverDesignModal } from './CoverDesignModal'
import { RemasterModal } from './RemasterModal'
import { AIStatusDot } from './AIStatusDot'

export function DashboardActions() {
    const [lineArtOpen, setLineArtOpen] = useState(false)
    const [coverDesignOpen, setCoverDesignOpen] = useState(false)
    const [remasterOpen, setRemasterOpen] = useState(false)

    return (
        <>
            <div className="flex flex-col gap-2">
                <Link href="/admin/project/new">
                    <Button className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        New Project
                    </Button>
                </Link>
                <Button variant="outline" className="w-full" onClick={() => setLineArtOpen(true)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Line Art
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setCoverDesignOpen(true)}>
                    <BookImage className="w-4 h-4 mr-2" />
                    Cover Design
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setRemasterOpen(true)}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Remaster
                </Button>
            </div>
            <LineArtModal open={lineArtOpen} onOpenChange={setLineArtOpen} />
            <CoverDesignModal open={coverDesignOpen} onOpenChange={setCoverDesignOpen} />
            <RemasterModal open={remasterOpen} onOpenChange={setRemasterOpen} />
        </>
    )
}

export function MobileHeader() {
    const [menuOpen, setMenuOpen] = useState(false)
    const [lineArtOpen, setLineArtOpen] = useState(false)
    const [coverDesignOpen, setCoverDesignOpen] = useState(false)
    const [remasterOpen, setRemasterOpen] = useState(false)

    return (
        <>
            <header className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
                <button onClick={() => setMenuOpen(!menuOpen)} className="p-1">
                    {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
                <h1 className="text-xl font-bold text-gray-900">Projects</h1>
                <AIStatusDot />
            </header>

            {menuOpen && (
                <div className="md:hidden fixed inset-0 top-[53px] z-30 bg-black/30" onClick={() => setMenuOpen(false)}>
                    <nav className="bg-white border-r border-gray-200 w-64 h-full p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                        <Link href="/admin/project/new" onClick={() => setMenuOpen(false)}>
                            <Button className="w-full">
                                <Plus className="w-4 h-4 mr-2" />
                                New Project
                            </Button>
                        </Link>
                        <Button variant="outline" className="w-full" onClick={() => { setLineArtOpen(true); setMenuOpen(false) }}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Line Art
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => { setCoverDesignOpen(true); setMenuOpen(false) }}>
                            <BookImage className="w-4 h-4 mr-2" />
                            Cover Design
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => { setRemasterOpen(true); setMenuOpen(false) }}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Remaster
                        </Button>
                        <Link href="/admin/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors text-base font-medium mt-4">
                            <Settings className="w-5 h-5" />
                            Settings
                        </Link>
                    </nav>
                </div>
            )}

            <LineArtModal open={lineArtOpen} onOpenChange={setLineArtOpen} />
            <CoverDesignModal open={coverDesignOpen} onOpenChange={setCoverDesignOpen} />
            <RemasterModal open={remasterOpen} onOpenChange={setRemasterOpen} />
        </>
    )
}
