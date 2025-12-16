import { Page } from '@/types/page'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sparkles, Loader2, Bookmark, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useState } from 'react'
import { toast } from 'sonner'

interface EmptyStateBoardProps {
    page: Page
    isGenerating: boolean
    isCustomer: boolean
    aspectRatio?: string
    setAspectRatio?: (val: string) => void
    textIntegration?: string
    setTextIntegration?: (val: string) => void
    onGenerate?: (refUrl?: string) => void
    previousIllustratedPages?: Page[]
}

export function EmptyStateBoard({
    page,
    isGenerating,
    isCustomer,
    aspectRatio,
    setAspectRatio,
    textIntegration,
    setTextIntegration,
    onGenerate,
    previousIllustratedPages = []
}: EmptyStateBoardProps) {
    // Local state for the dropdown
    const [selectedRefPageId, setSelectedRefPageId] = useState<string | null>(null)

    // BEAUTIFUL LOADING STATE
    if (isGenerating) {
        return (
            <div className="bg-white shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-6 h-full min-h-[500px]">
                <div className="relative">
                    <div className="absolute inset-0 bg-pink-100 rounded-full animate-pulse opacity-75"></div>
                    <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-full p-4">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-slate-900">Painting Illustration...</h2>
                    <p className="text-slate-500 text-sm">Applying watercolors and defining style from references.</p>
                </div>
            </div>
        )
    }

    if (isCustomer) {
        return (
            <div className="max-w-[1600px] mx-auto min-h-[400px] flex items-center justify-center bg-white rounded-xl border border-slate-200 text-slate-400">
                Pending Illustration Release...
            </div>
        )
    }

    // ADMIN CREATION WIZARD
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 h-full w-full bg-slate-50/50">

            {/* COLUMN 1 (LEFT): WIZARD CONTROLS */}
            <div className="h-full flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-slate-200/60 bg-white order-1 overflow-y-auto">
                <div className="space-y-4 max-w-md w-full">
                    <div className="flex flex-col items-center mb-6 text-center">
                        <div className="bg-purple-50 p-6 rounded-full mb-4">
                            <Sparkles className="w-10 h-10 text-purple-600" />
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-900">Ready to Create Art</h2>
                        <p className="text-slate-500 mt-2">
                            The AI Director has analyzed the story. We will now generate <b>Page {page.page_number}</b> to establish the artistic style for the entire book.
                        </p>
                    </div>

                    <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100 space-y-6 text-left">
                        {/* Aspect Ratio Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Aspect Ratio</Label>
                            {page.page_number === 1 ? (
                                <div className="flex flex-col space-y-2">
                                    {[
                                        { value: '8:10', label: '8:10 (Portrait)' },
                                        { value: '8.5:8.5', label: '8.5x8.5 (Square)' },
                                        { value: '8.5:11', label: '8.5x11 (Letter)' }
                                    ].map((option) => (
                                        <div
                                            key={option.value}
                                            className={`flex items-center space-x-3 p-2 rounded-md cursor-pointer transition-colors ${aspectRatio === option.value ? 'bg-purple-50 border border-purple-200' : 'hover:bg-slate-100 border border-transparent'}`}
                                            onClick={() => setAspectRatio && setAspectRatio(option.value)}
                                        >
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${aspectRatio === option.value ? 'border-purple-600' : 'border-slate-400'}`}>
                                                {aspectRatio === option.value && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                                            </div>
                                            <span className={`font-medium text-sm ${aspectRatio === option.value ? 'text-purple-900' : 'text-slate-700'}`}>{option.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-md p-3 text-sm text-slate-500">
                                    <span className="block font-medium text-slate-700 mb-1">Locked by Page 1</span>
                                    {aspectRatio || '8:10'} (Consistent with Book)
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-slate-200"></div>

                        {/* Text Placement Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Text Placement</Label>
                            <div className="flex flex-col space-y-2">
                                {[
                                    { value: 'integrated', label: 'Integrated', desc: 'Text inside illustration' },
                                    { value: 'separated', label: 'Separated', desc: 'Text on blank page' }
                                ].map((option) => (
                                    <div
                                        key={option.value}
                                        className={`flex items-center space-x-3 p-2 rounded-md cursor-pointer transition-colors ${textIntegration === option.value ? 'bg-purple-50 border border-purple-200' : 'hover:bg-slate-100 border border-transparent'}`}
                                        onClick={() => setTextIntegration && setTextIntegration(option.value)}
                                    >
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${textIntegration === option.value ? 'border-purple-600' : 'border-slate-400'}`}>
                                            {textIntegration === option.value && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                                        </div>
                                        <div>
                                            <span className={`font-medium text-sm block ${textIntegration === option.value ? 'text-purple-900' : 'text-slate-700'}`}>{option.label}</span>
                                            <p className="text-xs text-slate-400">{option.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-3 w-full max-w-md mt-6">
                    {/* MANUAL REFERENCE DROPDOWN */}
                    {previousIllustratedPages.length >= 2 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="min-w-[140px] justify-between border-slate-300 text-slate-700 hover:bg-slate-50">
                                    <span className="truncate max-w-[100px]">
                                        {selectedRefPageId
                                            ? `Page ${previousIllustratedPages.find(p => p.id === selectedRefPageId)?.page_number}`
                                            : `Page 1 (Default)`
                                        }
                                    </span>
                                    <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="start">
                                <DropdownMenuItem onClick={() => setSelectedRefPageId(null)} className="cursor-pointer font-medium">
                                    <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                                    Page 1 (Default Style)
                                </DropdownMenuItem>

                                {previousIllustratedPages.map(prevPage => (
                                    <DropdownMenuItem
                                        key={prevPage.id}
                                        onClick={() => setSelectedRefPageId(prevPage.id)}
                                        className="cursor-pointer"
                                    >
                                        <Bookmark className="w-4 h-4 mr-2 text-slate-400" />
                                        Page {prevPage.page_number}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    <Button
                        size="lg"
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-xl shadow-purple-200 transition-all hover:scale-105 flex-1"
                        onClick={() => {
                            if (!onGenerate) return
                            // VALIDATION
                            if (page.page_number === 1) {
                                if (!aspectRatio) return toast.error('Please select an Aspect Ratio first')
                                if (!textIntegration) return toast.error('Please select Text Placement first')
                            } else {
                                if (!textIntegration) return toast.error('Please select Text Placement first')
                            }

                            const refUrl = selectedRefPageId
                                ? previousIllustratedPages.find(p => p.id === selectedRefPageId)?.illustration_url || undefined
                                : undefined

                            onGenerate(refUrl)
                        }}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Initializing...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 mr-2" />
                                Generate
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* COLUMN 2 (RIGHT): TEXT CONTEXT */}
            <div className="h-full overflow-y-auto p-8 lg:p-12 bg-slate-50/30 order-2">
                <div className="max-w-xl mx-auto space-y-8 mt-4 md:mt-10">
                    {/* Page Label */}
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block text-center md:text-left">
                        Page {page.page_number} Context
                    </span>

                    {/* Story Text */}
                    <div className="prose prose-lg prose-slate text-center md:text-left">
                        <p className="font-serif text-xl leading-normal text-slate-800">
                            {page.story_text || <span className="italic text-slate-300">No story text available.</span>}
                        </p>
                    </div>

                    {/* Scene Description Box */}
                    {page.scene_description && (
                        <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
                            <h5 className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">
                                🎨 Illustration Notes
                            </h5>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                {page.scene_description}
                            </p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    )
}
