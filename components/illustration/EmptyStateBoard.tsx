import { Page } from '@/types/page'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Loader2, Bookmark, ChevronDown, ImagePlus, X, Info, Layers, Square, AlertCircle, ChevronRight, Save } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

interface BatchState {
    isRunning: boolean
    total: number
    completed: number
    failed: number
    currentPageIds: Set<string>
}

interface EmptyStateBoardProps {
    page: Page
    projectId?: string
    isGenerating: boolean
    isCustomer: boolean
    aspectRatio?: string
    setAspectRatio?: (val: string) => void
    textIntegration?: string
    setTextIntegration?: (val: string) => void
    isSpread?: boolean
    setIsSpread?: (val: boolean) => void
    onGenerate?: (refUrl?: string) => void
    illustratedPages?: Page[] // All pages with illustrations (for environment reference)
    
    // Batch Generation
    allPages?: Page[]
    onGenerateAllRemaining?: (startingPage: Page) => void
    onCancelBatch?: () => void
    batchState?: BatchState
    
    // Error State
    generationError?: { message: string; technicalDetails: string }
}

export function EmptyStateBoard({
    page,
    projectId,
    isGenerating,
    isCustomer,
    aspectRatio,
    setAspectRatio,
    textIntegration,
    setTextIntegration,
    isSpread = false,
    setIsSpread,
    onGenerate,
    illustratedPages = [],
    allPages = [],
    onGenerateAllRemaining,
    onCancelBatch,
    batchState,
    generationError
}: EmptyStateBoardProps) {
    // Local state for the dropdown
    const [selectedRefPageId, setSelectedRefPageId] = useState<string | null>(null)
    
    // Style Reference Upload State (only for Page 1)
    const [styleRefs, setStyleRefs] = useState<string[]>([])
    const [isUploadingStyleRef, setIsUploadingStyleRef] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    
    // Editable Scene Description state
    const [editedNotes, setEditedNotes] = useState(page.scene_description || '')
    const [isSavingNotes, setIsSavingNotes] = useState(false)
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
    const hasNotesChanged = editedNotes !== (page.scene_description || '')
    
    // Sync editedNotes when page changes
    useEffect(() => {
        setEditedNotes(page.scene_description || '')
    }, [page.scene_description, page.id])
    
    // Save illustration notes handler
    const handleSaveNotes = useCallback(async () => {
        if (!projectId) return
        
        setIsSavingNotes(true)
        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('pages')
                .update({ scene_description: editedNotes })
                .eq('id', page.id)
            
            if (error) throw error
            
            toast.success('Illustration notes saved')
            // Update the local page reference (will be refreshed on next render)
        } catch (error: any) {
            toast.error('Failed to save notes')
            console.error(error)
        } finally {
            setIsSavingNotes(false)
        }
    }, [projectId, page.id, editedNotes])

    // Load existing style references on mount (for Page 1 only)
    useEffect(() => {
        if (page.page_number !== 1 || !projectId || isCustomer) return

        const loadStyleRefs = async () => {
            const supabase = createClient()
            const { data } = await supabase
                .from('projects')
                .select('style_reference_urls')
                .eq('id', projectId)
                .single()
            
            if (data?.style_reference_urls?.length) {
                setStyleRefs(data.style_reference_urls)
            }
        }
        loadStyleRefs()
    }, [projectId, page.page_number, isCustomer])

    // Handle style reference upload
    const handleStyleRefUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0 || !projectId) return
        
        const currentCount = styleRefs.length
        const remainingSlots = 3 - currentCount
        
        if (remainingSlots === 0) {
            toast.error('Maximum 3 style references allowed')
            return
        }

        const filesToUpload = Array.from(files).slice(0, remainingSlots)
        setIsUploadingStyleRef(true)

        try {
            const formData = new FormData()
            filesToUpload.forEach((file, i) => {
                formData.append(`file${i}`, file)
            })

            const response = await fetch(`/api/projects/${projectId}/style-references`, {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Upload failed')
            }

            const data = await response.json()
            setStyleRefs(data.urls)
            toast.success(`Uploaded ${filesToUpload.length} style reference(s)`)
        } catch (error: any) {
            toast.error(error.message || 'Failed to upload style references')
        } finally {
            setIsUploadingStyleRef(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }, [projectId, styleRefs.length])

    // Handle removing all style references
    const handleRemoveStyleRefs = useCallback(async () => {
        if (!projectId) return
        
        try {
            const response = await fetch(`/api/projects/${projectId}/style-references`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to remove')
            }

            setStyleRefs([])
            toast.success('Style references removed')
        } catch (error: any) {
            toast.error(error.message || 'Failed to remove style references')
        }
    }, [projectId])

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
                        <div className={`p-6 rounded-full mb-4 ${generationError ? 'bg-red-50' : 'bg-purple-50'}`}>
                            {generationError ? (
                                <AlertCircle className="w-10 h-10 text-red-500" />
                            ) : (
                                <Sparkles className="w-10 h-10 text-purple-600" />
                            )}
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-900">Illustration {page.page_number}</h2>
                        
                        {/* Error Display */}
                        {generationError && (
                            <div className="mt-4 w-full max-w-sm">
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                                    <p className="text-sm font-medium text-red-800">{generationError.message}</p>
                                    
                                    {/* Expandable Technical Details */}
                                    <button
                                        onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                                        className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                                    >
                                        <ChevronRight className={`w-3 h-3 transition-transform ${showTechnicalDetails ? 'rotate-90' : ''}`} />
                                        Technical details
                                    </button>
                                    {showTechnicalDetails && (
                                        <pre className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700 overflow-x-auto whitespace-pre-wrap">
                                            {generationError.technicalDetails}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100 space-y-6 text-left">
                        {/* Aspect Ratio Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Aspect Ratio</Label>
                            {page.page_number === 1 ? (
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: '8:10', label: '8:10' },
                                        { value: '8.5:8.5', label: '8.5x8.5' },
                                        { value: '8.5:11', label: '8.5x11' }
                                    ].map((option) => (
                                        <div
                                            key={option.value}
                                            className={`flex flex-col items-center p-3 rounded-lg cursor-pointer transition-colors text-center ${aspectRatio === option.value ? 'bg-purple-50 border-2 border-purple-300' : 'hover:bg-slate-100 border-2 border-transparent bg-white'}`}
                                            onClick={() => setAspectRatio && setAspectRatio(option.value)}
                                        >
                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mb-2 ${aspectRatio === option.value ? 'border-purple-600' : 'border-slate-300'}`}>
                                                {aspectRatio === option.value && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                                            </div>
                                            <span className={`font-medium text-sm ${aspectRatio === option.value ? 'text-purple-900' : 'text-slate-700'}`}>{option.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-md p-3 text-sm text-slate-500">
                                    <span className="block font-medium text-slate-700 mb-1">Locked by Page 1</span>
                                    {aspectRatio || '8:10'}
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-slate-200"></div>

                        {/* Text Placement Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Text Placement</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'integrated', label: 'Integrated', desc: 'Text inside illustration' },
                                    { value: 'separated', label: 'Separated', desc: 'Text on blank page' }
                                ].map((option) => (
                                    <div
                                        key={option.value}
                                        className={`flex flex-col items-center p-3 rounded-lg cursor-pointer transition-colors text-center ${textIntegration === option.value ? 'bg-purple-50 border-2 border-purple-300' : 'hover:bg-slate-100 border-2 border-transparent bg-white'}`}
                                        onClick={() => setTextIntegration && setTextIntegration(option.value)}
                                    >
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mb-2 ${textIntegration === option.value ? 'border-purple-600' : 'border-slate-300'}`}>
                                            {textIntegration === option.value && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                                        </div>
                                        <span className={`font-medium text-sm ${textIntegration === option.value ? 'text-purple-900' : 'text-slate-700'}`}>{option.label}</span>
                                        <p className="text-xs text-slate-400 mt-0.5">{option.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Spread Checkbox (Hidden for Page 1) */}
                        {page.page_number > 1 && setIsSpread && (
                            <>
                                <div className="h-px bg-slate-200"></div>
                                <div className="space-y-2">
                                    <div 
                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isSpread ? 'bg-purple-50 border-2 border-purple-300' : 'hover:bg-slate-100 border-2 border-transparent bg-white'}`}
                                        onClick={() => {
                                            setIsSpread(!isSpread)
                                            // Auto-select integrated text when enabling spread
                                            if (!isSpread && setTextIntegration) {
                                                setTextIntegration('integrated')
                                            }
                                        }}
                                    >
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSpread ? 'border-purple-600 bg-purple-600' : 'border-slate-300'}`}>
                                            {isSpread && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <span className={`font-medium text-sm ${isSpread ? 'text-purple-900' : 'text-slate-700'}`}>Double-Page Spread</span>
                                            <p className="text-xs text-slate-400">Uses wider aspect ratio (21:9 or 16:9)</p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Style Reference Upload (Page 1 Admin Only) */}
                        {page.page_number === 1 && !isCustomer && projectId && (
                            <>
                                <div className="h-px bg-slate-200"></div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                            Style Reference
                                        </Label>
                                        <span className="text-xs text-slate-400">(Optional)</span>
                                    </div>
                                    
                                    {/* Info text */}
                                    <p className="text-xs text-slate-500 flex items-start gap-1.5">
                                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                                        Upload up to 3 images to match a specific illustration style. Useful for sequels or style matching.
                                    </p>

                                    {/* Uploaded style refs preview */}
                                    {styleRefs.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            {styleRefs.map((url, idx) => (
                                                <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                                                    <Image
                                                        src={url}
                                                        alt={`Style ref ${idx + 1}`}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                </div>
                                            ))}
                                            {/* Remove button */}
                                            <button
                                                onClick={handleRemoveStyleRefs}
                                                className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
                                                title="Remove all style references"
                                            >
                                                <X className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Upload button */}
                                    {styleRefs.length < 3 && (
                                        <div>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                                multiple
                                                onChange={(e) => handleStyleRefUpload(e.target.files)}
                                                className="hidden"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploadingStyleRef}
                                            >
                                                {isUploadingStyleRef ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Uploading...
                                                    </>
                                                ) : (
                                                    <>
                                                        <ImagePlus className="w-4 h-4 mr-2" />
                                                        {styleRefs.length === 0 ? 'Upload Style References' : `Add More (${3 - styleRefs.length} remaining)`}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-col items-center gap-3 w-full max-w-md mt-6">
                    <div className="flex items-center justify-center gap-3 w-full">
                        {/* MANUAL REFERENCE DROPDOWN - Show if there are illustrated pages to reference */}
                        {illustratedPages.length >= 1 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="min-w-[140px] justify-between border-slate-300 text-slate-700 hover:bg-slate-50">
                                        <span className="truncate max-w-[100px]">
                                            {selectedRefPageId
                                                ? `Page ${illustratedPages.find(p => p.id === selectedRefPageId)?.page_number}`
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

                                    {illustratedPages.map(prevPage => (
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
                                    ? illustratedPages.find(p => p.id === selectedRefPageId)?.illustration_url || undefined
                                    : undefined

                                onGenerate(refUrl)
                            }}
                            disabled={isGenerating || batchState?.isRunning}
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
                    
                    {/* BATCH GENERATION: Progress Indicator */}
                    {batchState?.isRunning && (
                        <div className="w-full bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                                    <span className="text-sm font-medium text-purple-900">
                                        Generating {batchState.completed + 1}/{batchState.total} illustrations...
                                    </span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={onCancelBatch}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                                >
                                    <Square className="w-3 h-3 mr-1 fill-current" />
                                    Cancel
                                </Button>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-purple-100 rounded-full h-2">
                                <div 
                                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(batchState.completed / batchState.total) * 100}%` }}
                                />
                            </div>
                            {batchState.failed > 0 && (
                                <p className="text-xs text-red-600">{batchState.failed} failed</p>
                            )}
                        </div>
                    )}
                    
                    {/* BATCH GENERATION: Generate All Remaining Button */}
                    {!isCustomer && 
                     page.page_number > 1 && 
                     allPages.length > 0 &&
                     page.page_number < Math.max(...allPages.map(p => p.page_number)) &&
                     onGenerateAllRemaining &&
                     !batchState?.isRunning && (
                        <Button
                            variant="outline"
                            className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300"
                            onClick={() => onGenerateAllRemaining(page)}
                            disabled={isGenerating}
                        >
                            <Layers className="w-4 h-4 mr-2" />
                            Generate All Remaining
                        </Button>
                    )}
                </div>
            </div>

            {/* COLUMN 2 (RIGHT): TEXT CONTEXT */}
            <div className="h-full overflow-y-auto p-8 lg:p-12 bg-slate-50/30 order-2">
                <div className="max-w-xl mx-auto space-y-8 mt-4 md:mt-10">
                    {/* Page Label */}
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block text-center md:text-left">
                        Page {page.page_number} Context
                    </span>

                    {/* SCROLLABLE CONTENT AREA */}
                    <div className="max-h-[500px] overflow-y-auto pr-4 custom-scrollbar space-y-8">
                        {/* Story Text */}
                        <div className="prose prose-lg prose-slate text-center md:text-left">
                            <p className="font-serif text-xl leading-normal text-slate-800">
                                {page.story_text || <span className="italic text-slate-300">No story text available.</span>}
                            </p>
                        </div>

                        {/* Scene Description Box - Editable */}
                        <div className={`p-6 rounded-xl border ${generationError ? 'bg-amber-50 border-amber-200' : 'bg-amber-50 border-amber-100'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h5 className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-widest">
                                    🎨 Scene Description
                                </h5>
                                {hasNotesChanged && (
                                    <Button
                                        size="sm"
                                        onClick={handleSaveNotes}
                                        disabled={isSavingNotes}
                                        className="h-7 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                                    >
                                        {isSavingNotes ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <>
                                                <Save className="w-3 h-3 mr-1" />
                                                Save
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                            <Textarea
                                value={editedNotes}
                                onChange={(e) => setEditedNotes(e.target.value)}
                                placeholder="Describe the scene for the illustrator..."
                                className="min-h-[120px] text-sm text-slate-700 leading-relaxed bg-white border-amber-200 focus:border-amber-400 focus:ring-amber-400 resize-none"
                            />
                            {generationError && (
                                <p className="mt-2 text-xs text-amber-700">
                                    💡 Try editing the notes above and regenerating
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}
