'use client'

import { useState, useRef, useCallback } from 'react'
import { Page } from '@/types/page'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { MessageSquarePlus, CheckCircle2, Download, Upload, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PageStatusBar } from '@/components/project/PageStatusBar'
import { ReviewHistoryDialog } from '@/components/project/ReviewHistoryDialog'

// --------------------------------------------------------------------------
// SHARED INTERFACE
// --------------------------------------------------------------------------
interface SharedIllustrationBoardProps {
    page: Page
    mode: 'admin' | 'customer'

    // CUSTOMER PROPS
    illustrationStatus?: string
    onSaveFeedback?: (notes: string) => Promise<void>

    // ADMIN PROPS
    isGenerating?: boolean
    isUploading?: boolean
    loadingState?: { sketch: boolean; illustration: boolean }

    // Admin Wizard State
    aspectRatio?: string
    setAspectRatio?: (val: string) => void
    textIntegration?: string
    setTextIntegration?: (val: string) => void

    // Admin Handlers
    onGenerate?: () => void
    onRegenerate?: (prompt: string) => void
    onUpload?: (type: 'sketch' | 'illustration', file: File) => void
}

export function SharedIllustrationBoard({
    page,
    mode,
    illustrationStatus = 'draft',
    onSaveFeedback,
    isGenerating = false,
    isUploading = false,
    loadingState = { sketch: false, illustration: false },
    aspectRatio,
    setAspectRatio,
    textIntegration,
    setTextIntegration,
    onGenerate,
    onRegenerate,
    onUpload
}: SharedIllustrationBoardProps) {

    // Helper for the beautiful animation
    const AnimatedOverlay = ({ label }: { label: string }) => (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-[2px] flex items-center justify-center z-50 animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-pink-100 rounded-full animate-pulse opacity-75"></div>
                    <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-full p-4">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                </div>
                <div className="space-y-1 text-center">
                    <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
                </div>
            </div>
        </div>
    )

    // --------------------------------------------------------------------------
    // LOCAL STATE
    // --------------------------------------------------------------------------
    const [notes, setNotes] = useState(page.feedback_notes || '')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showImage, setShowImage] = useState<string | null>(null)
    const [historyOpen, setHistoryOpen] = useState(false)

    // Admin: Regenerate Logic
    const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false)
    const [regenerationPrompt, setRegenerationPrompt] = useState('')

    // Refs for hidden inputs
    const sketchInputRef = useRef<HTMLInputElement>(null)
    const illustrationInputRef = useRef<HTMLInputElement>(null)

    const isAdmin = mode === 'admin'
    const isCustomer = mode === 'customer'

    // Lock logic (matches Customer backup implicitly via read-only checks)
    const isLocked = !isAdmin && ['illustration_approved', 'illustration_production', 'completed'].includes(illustrationStatus)

    // --------------------------------------------------------------------------
    // HANDLERS
    // --------------------------------------------------------------------------
    const handleDownload = useCallback((url: string, filename: string) => {
        window.location.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
    }, [])

    const handleCustomerSave = useCallback(async () => {
        if (!onSaveFeedback) return
        if (!notes.trim()) {
            setIsEditing(false)
            return
        }
        setIsSaving(true)
        try {
            await onSaveFeedback(notes)
            setIsEditing(false)
            toast.success('Feedback saved successfully')
        } catch (e) {
            console.error(e)
            toast.error('Failed to save feedback')
        } finally {
            setIsSaving(false)
        }
    }, [onSaveFeedback, notes])

    const handleAdminUploadSelect = useCallback((type: 'sketch' | 'illustration') => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && onUpload) {
            onUpload(type, e.target.files[0])
        }
    }, [onUpload])

    const isManualUpload = (url: string | null | undefined) => {
        return url?.includes('-manual')
    }

    // --------------------------------------------------------------------------
    // EMPTY STATE (WIZARD vs PENDING)
    // Same functionality as before because backup tab content also had this logic
    // --------------------------------------------------------------------------
    const renderEmptyState = () => {
        // BEAUTIFUL LOADING STATE (Restored from Backup)
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
        // ADMIN CREATION WIZARD (Restored Beautiful Layout)
        return (
            <div className="bg-white shadow-sm border border-slate-200 p-8 md:p-12 text-center flex flex-col items-center justify-center space-y-8 min-h-[500px] h-full">
                <div className="space-y-4 max-w-md w-full">
                    <div className="flex flex-col items-center mb-6">
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
                                <RadioGroup
                                    value={aspectRatio}
                                    onValueChange={setAspectRatio}
                                    className="flex flex-col space-y-2"
                                >
                                    <div className="flex items-center space-x-3">
                                        <RadioGroupItem value="8:10" id={`r1-${page.id}`} />
                                        <Label htmlFor={`r1-${page.id}`} className="font-medium text-sm cursor-pointer text-slate-700">8:10 (Portrait)</Label>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <RadioGroupItem value="8.5:8.5" id={`r2-${page.id}`} />
                                        <Label htmlFor={`r2-${page.id}`} className="font-medium text-sm cursor-pointer text-slate-700">8.5x8.5 (Square)</Label>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <RadioGroupItem value="8.5:11" id={`r3-${page.id}`} />
                                        <Label htmlFor={`r3-${page.id}`} className="font-medium text-sm cursor-pointer text-slate-700">8.5x11 (Letter)</Label>
                                    </div>
                                </RadioGroup>
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
                            <RadioGroup
                                value={textIntegration}
                                onValueChange={setTextIntegration}
                                className="flex flex-col space-y-2"
                            >
                                <div className="flex items-center space-x-3">
                                    <RadioGroupItem value="integrated" id={`t1-${page.id}`} />
                                    <div>
                                        <Label htmlFor={`t1-${page.id}`} className="font-medium text-sm cursor-pointer text-slate-700">Integrated</Label>
                                        <p className="text-xs text-slate-400">Text inside illustration</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <RadioGroupItem value="separated" id={`t2-${page.id}`} />
                                    <div>
                                        <Label htmlFor={`t2-${page.id}`} className="font-medium text-sm cursor-pointer text-slate-700">Separated</Label>
                                        <p className="text-xs text-slate-400">Text on blank page</p>
                                    </div>
                                </div>
                            </RadioGroup>
                        </div>
                    </div>
                </div>

                <Button
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-xl shadow-purple-200 transition-all hover:scale-105 min-w-[240px]"
                    onClick={onGenerate}
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
                            Generate Illustration
                        </>
                    )}
                </Button>
            </div>
        )
    }

    // --------------------------------------------------------------------------
    // MAIN RENDER (RESTORED LAYOUT)
    // --------------------------------------------------------------------------

    // Check if we show empty state (no illustration yet)
    if (!page.customer_illustration_url && !page.customer_sketch_url && isCustomer) return renderEmptyState()
    if (!page.illustration_url && isAdmin) return renderEmptyState() // Admin uses internal URL

    // Use correct URLs based on role
    const sketchUrl = isAdmin ? page.sketch_url : page.customer_sketch_url
    const illustrationUrl = isAdmin ? page.illustration_url : page.customer_illustration_url

    return (
        <div id={`page-${page.id}`} className="max-w-[1600px] mx-auto w-full h-full snap-start" data-page-id={page.id}>
            <div className="bg-white shadow-sm border border-slate-200 flex flex-col md:flex-row min-h-[600px] h-full">

                {/* ----------------------------------------------------------- */}
                {/* LEFT COLUMN: REVIEWS & CONTEXT                              */}
                {/* Customer Backup: w-72 lg:w-80                               */}
                {/* Admin Backup: w-72                                          */}
                {/* ----------------------------------------------------------- */}
                <div className="hidden md:flex w-72 lg:w-80 flex-col shrink-0 border-r border-slate-100 bg-slate-50/50 h-full">
                    {/* Header 73px - Matches Backup */}
                    <div className="p-4 border-b border-slate-100 h-[73px] flex items-center justify-between shrink-0">
                        <h4 className="font-semibold text-slate-800">Reviews</h4>
                        {/* ADMIN ONLY: REGEN BUTTON (Strictly from Admin Backup) */}
                        {isAdmin && onRegenerate && (
                            <Button variant="outline" size="sm" onClick={() => setIsRegenerateDialogOpen(true)} disabled={isGenerating} title="Regenerate with Instructions">
                                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                Regenerate
                            </Button>
                        )}
                    </div>

                    <div className="p-4 space-y-4 overflow-y-auto max-h-[800px] flex-1">
                        {isCustomer && (
                            <div className="text-sm text-slate-600 mb-4 space-y-2">
                                <p>Please review line work, composition, and character likeness.</p>
                                <p className="text-xs text-slate-400">
                                    Note: Colors and lighting might be adjusted in the final version.
                                </p>
                            </div>
                        )}

                        {/* FEEDBACK SECTION */}
                        <div className="mt-2">
                            {/* READ ONLY FEEDBACK */}
                            {!isEditing && page.feedback_notes && (
                                <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm text-amber-900 relative group animate-in fade-in zoom-in-95 duration-200">
                                    <p className="font-semibold text-xs text-amber-700 uppercase mb-1">Your Request:</p>
                                    <p className="whitespace-pre-wrap">{page.feedback_notes}</p>
                                    {isCustomer && !page.is_resolved && !isLocked && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="absolute top-1 right-1 h-6 px-2 text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-colors text-xs"
                                            onClick={() => { setNotes(page.feedback_notes || ''); setIsEditing(true) }}
                                        >
                                            Edit
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* EDIT MODE (Customer Only) */}
                            {isEditing && isCustomer ? (
                                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200 bg-white rounded-lg p-3 border border-amber-100 shadow-sm ring-1 ring-amber-50">
                                    <Label className="text-xs font-semibold text-amber-800 uppercase">Your Request:</Label>
                                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe what needs to be changed..." className="min-h-[120px] text-sm resize-none focus-visible:ring-amber-500 border-amber-200 bg-white" autoFocus />
                                    <div className="flex gap-3 justify-end mt-2">
                                        <Button variant="ghost" size="sm" onClick={() => { setNotes(page.feedback_notes || ''); setIsEditing(false) }} className="text-slate-600 hover:bg-slate-50">Cancel</Button>
                                        <Button size="sm" onClick={handleCustomerSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm" style={{ backgroundColor: '#d97706', color: '#ffffff' }}>
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                // CREATE BUTTON (Customer Only)
                                isCustomer && !page.feedback_notes && !isLocked && (
                                    <Button variant="outline" size="sm" className="w-full h-11 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 shadow-sm bg-white font-medium" onClick={() => setIsEditing(true)}>
                                        <MessageSquarePlus className="w-4 h-4" />
                                        Add Edits
                                    </Button>
                                )
                            )}
                        </div>

                        {/* HISTORY */}
                        {/* @ts-ignore */}
                        {page.feedback_history?.slice().reverse().map((item: any, i: number) => (
                            <div key={`hist-${i}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                <p className="leading-relaxed text-slate-700">
                                    <span className="font-bold text-slate-500 uppercase text-xs mr-2">Resolved:</span>
                                    {item.note}
                                </p>
                            </div>
                        ))}

                        {!page.feedback_notes && (!page.feedback_history || page.feedback_history.length === 0) && (
                            <div className="text-sm text-slate-400 italic text-center py-8">
                                No reviews yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* RIGHT COLUMN: IMAGES                                        */}
                {/* ----------------------------------------------------------- */}
                <div className="flex-1 flex flex-col min-w-0 h-full">

                    {/* MOBILE TOP BAR (Hidden) */}
                    <div className="hidden">
                        <PageStatusBar
                            status={page.feedback_notes && !page.is_resolved ? 'pending' : 'resolved'} // "request" vs "resolved" mapped to unified status
                            labelText={page.feedback_notes ? `Pending: ${page.feedback_notes}` : `Page ${page.page_number}`}
                            onStatusClick={() => setHistoryOpen(true)}
                            actionButton={
                                <div className="flex items-center gap-2">
                                    {/* Add Edits Button (Full Text) */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setHistoryOpen(true)}
                                        className="h-8 gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 font-semibold px-3 rounded-full"
                                    >
                                        <MessageSquarePlus className="w-4 h-4" />
                                        Add Edits
                                    </Button>
                                </div>
                            }
                        />
                        {/* HISTORY DIALOG (Mobile/Desktop Popup) */}
                        <ReviewHistoryDialog
                            open={historyOpen}
                            onOpenChange={setHistoryOpen}
                            page={page}
                            canEdit={isCustomer && !isLocked}
                            onSave={async (newNotes) => {
                                if (onSaveFeedback) await onSaveFeedback(newNotes)
                            }}
                        />
                    </div>

                    {/* DESKTOP HEADER (73px) */}
                    <div className="hidden md:grid grid-cols-2 divide-x border-b border-slate-100 h-[73px] bg-white text-sm">

                        {/* SKETCH HEADER */}
                        <div className="flex items-center justify-center gap-2 relative">
                            <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">Pencil Sketch</h4>
                            {isManualUpload(sketchUrl) && (
                                <span className="absolute top-1/2 -translate-y-1/2 right-12 lg:right-16 px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-600 rounded border border-rose-100 leading-none">
                                    UPLOADED
                                </span>
                            )}
                            {/* Admin Upload Button (From Admin Backup) */}
                            {isAdmin && onUpload && (
                                <>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => sketchInputRef.current?.click()} title="Upload Sketch">
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                    <input type="file" ref={sketchInputRef} className="hidden" accept="image/*" onChange={handleAdminUploadSelect('sketch')} />
                                </>
                            )}
                            {sketchUrl && (
                                <button onClick={() => handleDownload(sketchUrl!, `Page-${page.page_number}-Sketch.jpg`)} className="text-slate-400 hover:text-purple-600 transition-colors ml-2" title="Download Sketch">
                                    <Download className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* ILLUSTRATION HEADER */}
                        <div className="flex items-center justify-center gap-2 relative bg-slate-50/30">
                            <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">Final Illustration</h4>
                            {isManualUpload(illustrationUrl) && (
                                <span className="absolute top-1/2 -translate-y-1/2 right-12 lg:right-16 px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-600 rounded border border-rose-100 leading-none">
                                    UPLOADED
                                </span>
                            )}
                            {/* Admin Upload Button (From Admin Backup) */}
                            {isAdmin && onUpload && (
                                <>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => illustrationInputRef.current?.click()} title="Upload Illustration">
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                    <input type="file" ref={illustrationInputRef} className="hidden" accept="image/*" onChange={handleAdminUploadSelect('illustration')} />
                                </>
                            )}
                            {illustrationUrl && (
                                <button onClick={() => handleDownload(illustrationUrl!, `Page-${page.page_number}-Illustration.jpg`)} className="text-slate-400 hover:text-purple-600 transition-colors ml-2" title="Download Illustration">
                                    <Download className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* IMAGES GRID (The Core Layout) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x divide-slate-100 h-full overflow-y-auto md:overflow-hidden">

                        {/* 1. SKETCH BLOCK */}
                        <div className="flex flex-col items-center md:space-y-0 bg-white relative min-h-[300px] md:min-h-0">
                            {/* MOBILE HEADER FOR SKETCH (Overlay) */}
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden p-3 bg-gradient-to-b from-black/40 to-transparent">
                                <span className="text-xs font-bold tracking-wider text-white/90 uppercase shadow-sm">Sketch</span>

                                {/* 1. REGENERATE (Admin) */}
                                {isAdmin && onRegenerate && (
                                    <button
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-colors ml-auto"
                                        onClick={isGenerating ? undefined : () => setIsRegenerateDialogOpen(true)}
                                        disabled={isGenerating}
                                    >
                                        <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                    </button>
                                )}

                                {/* 2. UPLOAD (Admin) */}
                                {isAdmin && onUpload && (
                                    <Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full bg-black/40 text-red-500 hover:bg-black/60 backdrop-blur-sm ${isAdmin && onRegenerate ? 'ml-1' : 'ml-auto'}`} onClick={() => sketchInputRef.current?.click()}>
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                )}

                                {/* 3. DOWNLOAD */}
                                {sketchUrl && (
                                    <button onClick={() => handleDownload(sketchUrl!, `Page-${page.page_number}-Sketch.jpg`)} className={`h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm ${isAdmin && (onRegenerate || onUpload) ? 'ml-1' : 'ml-auto'}`}>
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="relative w-full h-full cursor-pointer hover:opacity-95 transition-opacity bg-white" onClick={() => setShowImage(sketchUrl || null)}>
                                {loadingState.sketch && <AnimatedOverlay label="Tracing Sketch..." />}
                                {sketchUrl ? (
                                    <img
                                        src={sketchUrl}
                                        alt="Sketch"
                                        className="w-full h-full object-contain grayscale contrast-125 block"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center min-h-[300px]">
                                        <span className="text-sm text-slate-300">No sketch available</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Mobile Add Edits Button (Between Images) */}
                        <div className="md:hidden w-full flex justify-center py-2 bg-white relative z-20 border-t border-slate-100">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHistoryOpen(true)}
                                className="h-8 gap-2 text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 font-semibold px-4 rounded-full shadow-sm"
                            >
                                <MessageSquarePlus className="w-4 h-4" />
                                {isAdmin ? 'Edits' : 'Add Edits'}
                            </Button>
                        </div>

                        {/* 2. ILLUSTRATION BLOCK */}
                        <div className="flex flex-col items-center md:space-y-0 bg-slate-50/10 relative min-h-[300px] md:min-h-0">
                            {/* MOBILE HEADER FOR ILLUSTRATION (Overlay) */}
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden p-3 bg-gradient-to-b from-black/40 to-transparent">
                                <span className="text-xs font-bold tracking-wider text-white/90 uppercase shadow-sm">Colored</span>

                                {/* 1. REGENERATE (Admin) */}
                                {isAdmin && onRegenerate && (
                                    <button
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-colors ml-auto"
                                        onClick={isGenerating ? undefined : () => setIsRegenerateDialogOpen(true)}
                                        disabled={isGenerating}
                                    >
                                        <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                    </button>
                                )}

                                {/* 2. UPLOAD (Admin) */}
                                {isAdmin && onUpload && (
                                    <Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full bg-black/40 text-red-500 hover:bg-black/60 backdrop-blur-sm ${isAdmin && onRegenerate ? 'ml-1' : 'ml-auto'}`} onClick={() => illustrationInputRef.current?.click()}>
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                )}

                                {/* 3. DOWNLOAD */}
                                {illustrationUrl && (
                                    <button onClick={() => handleDownload(illustrationUrl!, `Page-${page.page_number}-Final.jpg`)} className={`h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm ${isAdmin && (onRegenerate || onUpload) ? 'ml-1' : 'ml-auto'}`}>
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="relative w-full cursor-pointer hover:opacity-95 transition-opacity" onClick={() => setShowImage(illustrationUrl || null)}>
                                {/* Show overlay if specific granular loading is active OR if generating and we already have an image (regeneration case) */}
                                {(loadingState.illustration || (isGenerating && illustrationUrl)) && (
                                    <AnimatedOverlay label="Painting Illustration..." />
                                )}

                                {illustrationUrl ? (
                                    <img
                                        src={illustrationUrl}
                                        alt="Final"
                                        className={`w-full h-auto object-contain block ${isGenerating ? 'blur-sm scale-95 opacity-50' : ''} transition-all duration-700`}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center min-h-[300px]">
                                        {!isGenerating && !loadingState.illustration && (
                                            <span className="text-sm text-slate-300">No illustration available</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Lightbox */}
            <Dialog open={!!showImage} onOpenChange={(open) => !open && setShowImage(null)}>
                <DialogContent
                    showCloseButton={false}
                    className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                    aria-describedby={undefined}
                >
                    <DialogTitle className="sr-only">Full Size View</DialogTitle>
                    <DialogDescription className="sr-only">Review the illustration in full detail</DialogDescription>

                    <div className="relative w-full h-full flex items-center justify-center p-4" onClick={() => setShowImage(null)}>
                        {showImage && (
                            <img
                                src={showImage}
                                alt="Full view"
                                className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                        <button
                            className="absolute top-6 right-6 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50 pointer-events-auto cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowImage(null);
                            }}
                        >
                            <span className="sr-only">Close</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ADMIN REGENERATE DIALOG */}
            {isAdmin && onRegenerate && (
                <Dialog open={isRegenerateDialogOpen} onOpenChange={setIsRegenerateDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Regenerate Illustration</DialogTitle>
                            <DialogDescription>Describe what you want to change.</DialogDescription>
                        </DialogHeader>
                        <Textarea value={regenerationPrompt} onChange={(e) => setRegenerationPrompt(e.target.value)} placeholder="e.g. Make the lighting warmer..." className="min-h-[100px]" />
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsRegenerateDialogOpen(false)}>Cancel</Button>
                            <Button onClick={() => { setIsRegenerateDialogOpen(false); onRegenerate(regenerationPrompt) }}>Regenerate</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}
