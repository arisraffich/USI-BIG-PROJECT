'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { MessageSquarePlus, CheckCircle2, Download, Upload, Loader2, Sparkles, RefreshCw, Bookmark, X, ChevronDown, ChevronUp, AlignLeft, Users, Plus, Minus, Pencil, Check } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import Image from 'next/image'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { PageStatusBar } from '@/components/project/PageStatusBar'
import { EmptyStateBoard } from '@/components/illustration/EmptyStateBoard'
import { ReviewHistoryDialog } from '@/components/project/ReviewHistoryDialog'
import { useIllustrationLock } from '@/hooks/use-illustration-lock'

// Type for scene character with action/emotion
export interface SceneCharacter {
    id: string
    name: string
    imageUrl: string | null
    action: string
    emotion: string
    isIncluded: boolean
    isModified: boolean // Track if user modified from AI Director's original
}

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

export interface SharedIllustrationBoardProps {
    page: Page
    mode: 'admin' | 'customer'
    projectId?: string
    illustrationStatus?: 'draft' | 'illustration_approved' | 'illustration_production' | 'completed'
    projectStatus?: string // Main status field - used for lock logic
    onSaveFeedback: (notes: string) => Promise<void>
    isGenerating?: boolean
    isUploading?: boolean
    loadingState?: { sketch: boolean, illustration: boolean }
    aspectRatio?: string
    setAspectRatio?: (ratio: string) => void
    textIntegration?: string
    setTextIntegration?: (text: string) => void
    onGenerate?: () => void
    onRegenerate?: (prompt: string, referenceImages?: string[], referenceImageUrl?: string, sceneCharacters?: SceneCharacter[]) => void
    onUpload?: (type: 'sketch' | 'illustration', file: File) => Promise<void>
    illustratedPages?: Page[] // All pages with illustrations (for environment reference)
    characters?: Character[] // All project characters for character control
    
    // Batch Generation
    allPages?: Page[]
    onGenerateAllRemaining?: (startingPage: Page) => void
    onCancelBatch?: () => void
    batchState?: {
        isRunning: boolean
        total: number
        completed: number
        failed: number
        currentPageIds: Set<string>
    }
    
    // Error State
    generationError?: { message: string; technicalDetails: string }
}

export function SharedIllustrationBoard({
    page,
    mode,
    projectId,
    illustrationStatus = 'draft',
    projectStatus,
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
    onUpload,
    illustratedPages = [],
    characters = [],
    allPages,
    onGenerateAllRemaining,
    onCancelBatch,
    batchState,
    generationError
}: SharedIllustrationBoardProps) {

    // --------------------------------------------------------------------------
    // LOCAL STATE
    // --------------------------------------------------------------------------
    const [notes, setNotes] = useState(page.feedback_notes || '')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showImage, setShowImage] = useState<string | null>(null)
    const [historyOpen, setHistoryOpen] = useState(false) // For mobile popup
    const [inlineHistoryExpanded, setInlineHistoryExpanded] = useState(false) // For desktop inline collapsible
    const historyDropdownRef = useRef<HTMLDivElement>(null) // For click-outside collapse

    // NEW: View Mode for Sketch Card
    const [sketchViewMode, setSketchViewMode] = useState<'sketch' | 'text'>('sketch')
    
    // Admin: Editable Scene Description
    const [editedSceneNotes, setEditedSceneNotes] = useState(page.scene_description || '')
    const [isSavingSceneNotes, setIsSavingSceneNotes] = useState(false)
    const hasSceneNotesChanged = editedSceneNotes !== (page.scene_description || '')

    // Admin: Regenerate Logic
    const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false)
    const [regenerationPrompt, setRegenerationPrompt] = useState('')
    const [referenceImages, setReferenceImages] = useState<{ file: File; preview: string }[]>([])
    
    // NEW: Environment Reference & Character Control (Mode 3/4)
    const [selectedEnvPageId, setSelectedEnvPageId] = useState<string | null>(null)
    const [sceneCharacters, setSceneCharacters] = useState<SceneCharacter[]>([])
    const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
    const [editAction, setEditAction] = useState('')
    const [editEmotion, setEditEmotion] = useState('')

    // Refs for hidden inputs
    const sketchInputRef = useRef<HTMLInputElement>(null)
    const illustrationInputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null) // For Reference Images

    const isAdmin = mode === 'admin'
    const isCustomer = mode === 'customer'

    // Centralized lock logic from useIllustrationLock hook
    const { isCustomerLocked } = useIllustrationLock({
        projectStatus,
        mode,
    })
    const isLocked = isCustomerLocked
    
    // Check if we're in Scene Recreation mode (dropdown selected)
    const isSceneRecreationMode = selectedEnvPageId !== null
    
    // Get character actions from the page for initializing scene characters
    const pageCharacterActions = useMemo(() => {
        return (page.character_actions || {}) as Record<string, { action?: string; pose?: string; emotion?: string }>
    }, [page.character_actions])
    
    // Initialize scene characters when dialog opens in Scene Recreation mode
    useEffect(() => {
        if (isRegenerateDialogOpen && isSceneRecreationMode && characters.length > 0) {
            const initialSceneChars: SceneCharacter[] = characters.map(char => {
                const charName = char.name || char.role || 'Character'
                const existingAction = pageCharacterActions[charName]
                const isInScene = !!existingAction
                
                return {
                    id: char.id,
                    name: charName,
                    imageUrl: char.image_url || null,
                    action: existingAction?.action || existingAction?.pose || '',
                    emotion: existingAction?.emotion || '',
                    isIncluded: isInScene,
                    isModified: false
                }
            })
            setSceneCharacters(initialSceneChars)
        }
    }, [isRegenerateDialogOpen, isSceneRecreationMode, characters, pageCharacterActions])
    
    // Reset scene characters when dropdown changes to None
    useEffect(() => {
        if (!isSceneRecreationMode) {
            setSceneCharacters([])
        }
    }, [isSceneRecreationMode])
    
    // Click-outside handler to collapse history dropdown
    useEffect(() => {
        if (!inlineHistoryExpanded) return
        
        const handleClickOutside = (event: MouseEvent) => {
            if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
                setInlineHistoryExpanded(false)
            }
        }
        
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [inlineHistoryExpanded])
    
    // Sync editedSceneNotes when page changes
    useEffect(() => {
        setEditedSceneNotes(page.scene_description || '')
    }, [page.scene_description, page.id])
    
    // Save illustration notes handler (Admin only)
    const handleSaveSceneNotes = useCallback(async () => {
        if (!projectId) return
        
        setIsSavingSceneNotes(true)
        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('pages')
                .update({ scene_description: editedSceneNotes })
                .eq('id', page.id)
            
            if (error) throw error
            
            toast.success('Illustration notes saved')
        } catch (error: any) {
            toast.error('Failed to save notes')
            console.error(error)
        } finally {
            setIsSavingSceneNotes(false)
        }
    }, [projectId, page.id, editedSceneNotes])

    // --------------------------------------------------------------------------
    // HANDLERS
    // --------------------------------------------------------------------------
    const handleReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return

        const files = Array.from(e.target.files)
        const validFiles = files.filter(file => {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                toast.error(`"${file.name}" is too large (max 10MB).`)
                return false
            }
            return true
        })

        if (referenceImages.length + validFiles.length > 5) {
            toast.error("Max 5 reference images allowed.")
            return
        }

        const newrefs = validFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file)
        }))

        setReferenceImages(prev => [...prev, ...newrefs])

        // Clear input value so same file can be selected again if needed
        if (e.target) e.target.value = ''
    }

    const removeReference = (index: number) => {
        setReferenceImages(prev => {
            const newImages = [...prev]
            URL.revokeObjectURL(newImages[index].preview) // Cleanup
            newImages.splice(index, 1)
            return newImages
        })
    }

    const handleDownload = useCallback((url: string, filename: string) => {
        // Use anchor click instead of window.location.href to prevent scroll state corruption
        const link = document.createElement('a')
        link.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }, [])

    const handleCustomerSave = useCallback(async (textOverride?: string) => {
        if (!onSaveFeedback) return

        // Use override (from mobile modal) or local state (desktop)
        const textToSave = typeof textOverride === 'string' ? textOverride : notes

        if (!textToSave.trim()) {
            setIsEditing(false)
            return
        }
        setIsSaving(true)
        try {
            await onSaveFeedback(textToSave)
            setNotes(textToSave) // Sync local state
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
        // Reset input so same file can be selected again
        e.target.value = ''
    }, [onUpload])

    const isManualUpload = (url: string | null | undefined) => {
        return url?.includes('-manual')
    }

    // --------------------------------------------------------------------------
    // MAIN RENDER (RESTORED LAYOUT)
    // --------------------------------------------------------------------------

    // Check if we show empty state (no illustration yet)
    if (!page.customer_illustration_url && !page.customer_sketch_url && isCustomer) {
        return (
            <EmptyStateBoard
                page={page}
                projectId={projectId}
                isGenerating={isGenerating}
                isCustomer={isCustomer}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                textIntegration={textIntegration}
                setTextIntegration={setTextIntegration}
                onGenerate={onGenerate}
                illustratedPages={illustratedPages}
            />
        )
    }

    if (!page.illustration_url && isAdmin) {
        return (
            <EmptyStateBoard
                page={page}
                projectId={projectId}
                isGenerating={isGenerating}
                isCustomer={isCustomer}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                textIntegration={textIntegration}
                setTextIntegration={setTextIntegration}
                onGenerate={onGenerate}
                illustratedPages={illustratedPages}
                allPages={allPages}
                onGenerateAllRemaining={onGenerateAllRemaining}
                onCancelBatch={onCancelBatch}
                batchState={batchState}
                generationError={generationError}
            />
        )
    }

    // Use correct URLs based on role
    const sketchUrl = isAdmin ? page.sketch_url : page.customer_sketch_url
    const illustrationUrl = isAdmin ? page.illustration_url : page.customer_illustration_url

    return (
        <div className="max-w-[1600px] mx-auto w-full h-full snap-start">
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
                            <div className="text-sm text-slate-600 mb-4 leading-relaxed">
                                <p>Request revisions here. Adjustments will be ready within 1-3 days.</p>
                            </div>
                        )}

                        {/* FEEDBACK SECTION */}
                        <div className="mt-2">
                            {/* READ ONLY FEEDBACK */}
                            {!isEditing && page.feedback_notes && (
                                <div className={`${page.is_resolved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-100'} border rounded-md p-3 text-sm relative group animate-in fade-in zoom-in-95 duration-200`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <p className={`font-semibold text-xs uppercase ${page.is_resolved ? 'text-green-700' : 'text-amber-700'}`}>
                                            {page.is_resolved ? 'Resolved:' : 'Your Request:'}
                                        </p>
                                        {page.is_resolved && (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                RESOLVED
                                            </span>
                                        )}
                                    </div>
                                    <p className={`whitespace-pre-wrap ${page.is_resolved ? 'text-green-900' : 'text-amber-900'}`}>{page.feedback_notes}</p>
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
                                        <Button size="sm" onClick={() => handleCustomerSave()} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm" style={{ backgroundColor: '#d97706', color: '#ffffff' }}>
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                // CREATE BUTTON (Customer Only)
                                isCustomer && !page.feedback_notes && !isLocked && (
                                    <Button variant="outline" size="sm" className="w-full h-11 gap-2 text-amber-600 border-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-700 shadow-sm bg-white font-medium" onClick={() => setIsEditing(true)}>
                                        <MessageSquarePlus className="w-4 h-4" />
                                        Request Revision
                                    </Button>
                                )
                            )}
                        </div>

                        {/* HISTORY - Smart Collapsible */}
                        {page.feedback_history && page.feedback_history.length > 0 && (() => {
                            const reversedHistory = page.feedback_history.slice().reverse()
                            const latestItem = reversedHistory[0]
                            const olderItems = reversedHistory.slice(1)
                            const hasCurrentFeedback = !!page.feedback_notes
                            
                            // If current feedback exists: collapse ALL history
                            // If no current feedback: show latest outside, collapse older ones
                            const itemsToCollapse = hasCurrentFeedback ? reversedHistory : olderItems
                            const showLatestOutside = !hasCurrentFeedback
                            
                            return (
                                <div className="mt-3 space-y-2">
                                    {/* Latest resolved - show outside dropdown when no current feedback */}
                                    {showLatestOutside && latestItem && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm flex items-start gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                            <p className="leading-relaxed text-green-900">
                                                <span className="font-bold text-green-700 uppercase text-xs mr-2">Resolved:</span>
                                                {(latestItem as any).note}
                                            </p>
                                        </div>
                                    )}
                                    
                                    {/* Collapsible section for older items */}
                                    {itemsToCollapse.length > 0 && (
                                        <div ref={historyDropdownRef}>
                                            <button
                                                onClick={() => setInlineHistoryExpanded(!inlineHistoryExpanded)}
                                                className="flex items-center gap-2 text-sm text-slate-900 hover:text-slate-700 transition-colors w-full py-1"
                                            >
                                                {inlineHistoryExpanded ? (
                                                    <ChevronUp className="w-4 h-4" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4" />
                                                )}
                                                <span>
                                                    {inlineHistoryExpanded ? 'Hide' : 'Show'} {itemsToCollapse.length} previous revision{itemsToCollapse.length !== 1 ? 's' : ''}
                                                </span>
                                            </button>
                                            
                                            {inlineHistoryExpanded && (
                                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                                    {/* @ts-ignore */}
                                                    {itemsToCollapse.map((item: any, i: number) => (
                                                        <div key={`hist-${i}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm flex items-start gap-2">
                                                            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                                            <p className="leading-relaxed text-slate-700">
                                                                <span className="font-bold text-slate-500 uppercase text-xs mr-2">Resolved:</span>
                                                                {item.note}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

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

                    {/* MOBILE TOP BAR (Vibrant Page Separator) */}
                    <div className="md:hidden w-full py-3 px-5 bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md flex items-center justify-between shrink-0 relative overflow-hidden z-20">
                        {/* Abstract Background Element (Subtle) */}
                        <div className="absolute top-0 right-16 w-64 h-full bg-white/5 skew-x-12"></div>

                        {/* Left: Page Identity */}
                        <div className="flex items-center gap-2 z-10">
                            <Bookmark className="w-5 h-5 text-white/90" fill="currentColor" />
                            <span className="text-white font-bold text-lg tracking-wide">
                                Page {page.page_number}
                            </span>
                        </div>

                        {/* Right: Action Button */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryOpen(true)}
                            className="bg-amber-500 hover:bg-amber-600 text-white border-transparent font-semibold px-4 h-8 gap-2 rounded-full z-10 transition-colors shadow-sm"
                        >
                            <MessageSquarePlus className="w-4 h-4" />
                            {isAdmin ? 'Revisions' : 'Request Revision'}
                        </Button>

                        {/* HISTORY DIALOG */}
                        <ReviewHistoryDialog
                            open={historyOpen}
                            onOpenChange={setHistoryOpen}
                            page={page}
                            canEdit={isCustomer && !isLocked}
                            onSave={handleCustomerSave}
                        />
                    </div>

                    {/* DESKTOP HEADER (73px) */}
                    <div className="hidden md:grid grid-cols-2 divide-x border-b border-slate-100 h-[73px] bg-white text-sm">

                        {/* SKETCH HEADER */}
                        {/* SKETCH HEADER */}
                        <div className="flex items-center justify-center gap-2 relative">

                            <DropdownMenu>
                                <DropdownMenuTrigger className="flex items-center gap-2 outline-none group">
                                    <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase group-hover:text-purple-600 transition-colors">
                                        {sketchViewMode === 'sketch' ? 'Sketch' : 'Text'}
                                    </h4>
                                    <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-purple-600 transition-colors" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center">
                                    <DropdownMenuItem onClick={() => setSketchViewMode('sketch')} className={`gap-2 cursor-pointer ${sketchViewMode === 'sketch' ? 'bg-purple-50 text-purple-700' : ''}`}>
                                        {sketchViewMode === 'sketch' ? <Check className="w-4 h-4 text-purple-600" /> : <Sparkles className="w-4 h-4 text-slate-500" />}
                                        <span>Sketch</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSketchViewMode('text')} className={`gap-2 cursor-pointer ${sketchViewMode === 'text' ? 'bg-purple-50 text-purple-700' : ''}`}>
                                        {sketchViewMode === 'text' ? <Check className="w-4 h-4 text-purple-600" /> : <AlignLeft className="w-4 h-4 text-slate-500" />}
                                        <span>Text</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {isManualUpload(sketchUrl) && sketchViewMode === 'sketch' && (
                                <span className="absolute top-1/2 -translate-y-1/2 right-12 lg:right-16 px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-600 rounded border border-rose-100 leading-none">
                                    UPLOADED
                                </span>
                            )}
                            {/* Admin Upload Button (From Admin Backup) - Only in Sketch Mode */}
                            {isAdmin && onUpload && sketchViewMode === 'sketch' && (
                                <>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => sketchInputRef.current?.click()} title="Upload Sketch">
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                    <input type="file" ref={sketchInputRef} className="hidden" accept="image/*" onChange={handleAdminUploadSelect('sketch')} />
                                </>
                            )}
                            {sketchUrl && sketchViewMode === 'sketch' && (
                                <button onClick={() => handleDownload(sketchUrl!, `Page-${page.page_number}-Sketch.jpg`)} className="text-slate-400 hover:text-purple-600 transition-colors ml-2" title="Download Sketch">
                                    <Download className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* ILLUSTRATION HEADER (or PAGE TEXT for customer pages 2+) */}
                        <div className="flex items-center justify-center gap-2 relative bg-slate-50/30">
                            <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                                {isCustomer && page.page_number > 1 ? 'Page Text' : 'Final Illustration'}
                            </h4>
                            {/* Show UPLOADED badge only for admin or customer page 1 */}
                            {!(isCustomer && page.page_number > 1) && isManualUpload(illustrationUrl) && (
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
                            {/* Download button only for admin or customer page 1 */}
                            {!(isCustomer && page.page_number > 1) && illustrationUrl && (
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
                            {/* MOBILE HEADER FOR SKETCH (Overlay) */}
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden p-3 bg-gradient-to-b from-black/40 to-transparent">

                                <DropdownMenu>
                                    <DropdownMenuTrigger className="flex items-center gap-1 outline-none">
                                        <span className="text-xs font-bold tracking-wider text-white/90 uppercase shadow-sm">
                                            {sketchViewMode === 'sketch' ? 'Sketch' : 'Text'}
                                        </span>
                                        <ChevronDown className="w-3 h-3 text-white/80" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem onClick={() => setSketchViewMode('sketch')} className={`gap-2 cursor-pointer ${sketchViewMode === 'sketch' ? 'bg-purple-50 text-purple-700' : ''}`}>
                                            {sketchViewMode === 'sketch' ? <Check className="w-4 h-4 text-purple-600" /> : <Sparkles className="w-4 h-4" />}
                                            <span>Sketch</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSketchViewMode('text')} className={`gap-2 cursor-pointer ${sketchViewMode === 'text' ? 'bg-purple-50 text-purple-700' : ''}`}>
                                            {sketchViewMode === 'text' ? <Check className="w-4 h-4 text-purple-600" /> : <AlignLeft className="w-4 h-4" />}
                                            <span>Text</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* 1. REGENERATE (Admin) - Only show in Sketch Mode */}
                                {isAdmin && onRegenerate && sketchViewMode === 'sketch' && (
                                    <button
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-colors ml-auto"
                                        onClick={isGenerating ? undefined : () => setIsRegenerateDialogOpen(true)}
                                        disabled={isGenerating}
                                    >
                                        <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                    </button>
                                )}

                                {/* 2. UPLOAD (Admin) - Only show in Sketch Mode */}
                                {isAdmin && onUpload && sketchViewMode === 'sketch' && (
                                    <Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full bg-black/40 text-red-500 hover:bg-black/60 backdrop-blur-sm ${isAdmin && onRegenerate ? 'ml-1' : 'ml-auto'}`} onClick={() => sketchInputRef.current?.click()}>
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                )}

                                {/* 3. DOWNLOAD - Only show in Sketch Mode */}
                                {sketchUrl && sketchViewMode === 'sketch' && (
                                    <button onClick={() => handleDownload(sketchUrl!, `Page-${page.page_number}-Sketch.jpg`)} className={`h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm ${isAdmin && (onRegenerate || onUpload) ? 'ml-1' : 'ml-auto'}`}>
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* MAIN CONTENT: IMAGE or TEXT */}
                            {sketchViewMode === 'sketch' ? (
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
                            ) : (
                                /* TEXT VIEW MODE */
                                <div className="w-full p-8 bg-white text-slate-900 pointer-events-auto cursor-text text-left overflow-y-auto max-h-[60vh] md:max-h-none md:absolute md:inset-0 md:h-full">
                                    {/* 1. PAGE TEXT */}
                                    <div className="mb-8">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">Page {page.page_number}</span>
                                        <div className="max-h-[500px] overflow-y-auto pr-4 custom-scrollbar space-y-8">
                                            <p className="text-lg md:text-xl font-serif leading-relaxed text-slate-800">
                                                {page.story_text || <span className="italic text-slate-300">No text content available.</span>}
                                            </p>

                                            {/* 2. SCENE DESCRIPTION (Admin Only) */}
                                            {isAdmin && (
                                                <div className="bg-amber-50/50 p-5 rounded-lg border border-amber-100/60">
                                                    <span className="flex items-center gap-2 text-[10px] font-bold text-amber-600/80 uppercase tracking-widest mb-2">
                                                        🎨 Scene Description
                                                    </span>
                                                    <div className="space-y-3">
                                                        <Textarea
                                                            value={editedSceneNotes}
                                                            onChange={(e) => setEditedSceneNotes(e.target.value)}
                                                            placeholder="Describe the scene for the illustrator..."
                                                            className="min-h-[120px] text-sm resize-none bg-white border-amber-200 focus-visible:ring-amber-500"
                                                        />
                                                        {hasSceneNotesChanged && (
                                                            <div className="flex justify-end">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={handleSaveSceneNotes}
                                                                    disabled={isSavingSceneNotes}
                                                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                                                >
                                                                    {isSavingSceneNotes ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                                                    ) : (
                                                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                                                    )}
                                                                    Save Notes
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>



                        {/* 2. ILLUSTRATION BLOCK (or PAGE TEXT for customer pages 2+) */}
                        <div className="flex flex-col items-center md:space-y-0 bg-slate-50/10 relative min-h-[300px] md:min-h-0">
                            {/* MOBILE HEADER FOR ILLUSTRATION (Overlay) - Only for admin or customer page 1 */}
                            {!(isCustomer && page.page_number > 1) && (
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
                            )}

                            {/* MOBILE HEADER FOR PAGE TEXT (Customer pages 2+) */}
                            {isCustomer && page.page_number > 1 && (
                                <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden p-3 bg-gradient-to-b from-black/40 to-transparent">
                                    <span className="text-xs font-bold tracking-wider text-white/90 uppercase shadow-sm">Page Text</span>
                                </div>
                            )}

                            {/* CONTENT: Page Text for customer pages 2+, Illustration otherwise */}
                            {isCustomer && page.page_number > 1 ? (
                                /* PAGE TEXT VIEW for customer pages 2+ */
                                <div className="w-full h-full p-8 bg-white text-slate-900 overflow-y-auto">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">Page {page.page_number}</span>
                                    <p className="text-lg md:text-xl font-serif leading-relaxed text-slate-800">
                                        {page.story_text || <span className="italic text-slate-300">No text content available.</span>}
                                    </p>
                                </div>
                            ) : (
                                /* ILLUSTRATION VIEW for admin and customer page 1 */
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
                            )}
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
                <Dialog open={isRegenerateDialogOpen} onOpenChange={(open) => {
                    setIsRegenerateDialogOpen(open)
                    if (!open) {
                        setRegenerationPrompt('')
                        setReferenceImages([])
                        setSelectedEnvPageId(null)
                        setSceneCharacters([])
                        setEditingCharacterId(null)
                    }
                }}>
                    <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Regenerate Illustration</DialogTitle>
                            <DialogDescription>
                                {isSceneRecreationMode 
                                    ? 'Recreate scene with a different environment and customize characters.'
                                    : 'Describe what you want to change.'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            {/* ENVIRONMENT REFERENCE DROPDOWN (Mode 3/4) - Show for Page 2+ */}
                            {page.page_number >= 2 && illustratedPages.length >= 1 && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-purple-500" />
                                        Environment Reference
                                    </Label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between">
                                                <span>
                                                    {selectedEnvPageId
                                                        ? `Page ${illustratedPages.find(p => p.id === selectedEnvPageId)?.page_number} Environment`
                                                        : 'None (Edit Current Image)'}
                                                </span>
                                                <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[calc(550px-3rem)]" align="start">
                                            <DropdownMenuItem 
                                                onClick={() => setSelectedEnvPageId(null)} 
                                                className="cursor-pointer"
                                            >
                                                <X className="w-4 h-4 mr-2 text-slate-400" />
                                                None (Edit Current Image)
                                            </DropdownMenuItem>
                                            {illustratedPages.map(prevPage => (
                                                <DropdownMenuItem
                                                    key={prevPage.id}
                                                    onClick={() => setSelectedEnvPageId(prevPage.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <Bookmark className="w-4 h-4 mr-2 text-purple-500" />
                                                    Page {prevPage.page_number} Environment
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    {isSceneRecreationMode && (
                                        <p className="text-xs text-purple-600 bg-purple-50 p-2 rounded-md">
                                            Scene Recreation Mode: The selected page's background will be preserved.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* INSTRUCTIONS */}
                            <div className="space-y-2">
                                <Label>Instructions {isSceneRecreationMode && <span className="text-slate-400 font-normal">(Optional)</span>}</Label>
                                <Textarea
                                    value={regenerationPrompt}
                                    onChange={(e) => setRegenerationPrompt(e.target.value)}
                                    placeholder={isSceneRecreationMode 
                                        ? "e.g. Make the lighting warmer, change the camera angle..."
                                        : "e.g. Make the lighting warmer, add sunglasses..."}
                                    className="min-h-[80px]"
                                />
                            </div>

                            {/* MODE 1/2: REFERENCE IMAGES (Only when NOT in Scene Recreation mode) */}
                            {!isSceneRecreationMode && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">Reference Images (Optional)</Label>
                                        <span className="text-xs text-slate-400">{referenceImages.length}/5 • Max 10MB each</span>
                                    </div>

                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        multiple
                                        onChange={handleReferenceSelect}
                                    />

                                    {referenceImages.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {referenceImages.map((img, idx) => (
                                                <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border border-slate-200 group">
                                                    <img src={img.preview} alt="Ref" className="w-full h-full object-cover" />
                                                    <button
                                                        onClick={() => removeReference(idx)}
                                                        className="absolute top-0.5 right-0.5 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {referenceImages.length < 5 && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-50 gap-2 h-16"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Upload className="w-4 h-4" />
                                            Add Reference Image
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* MODE 3/4: CHARACTER CONTROL (Only in Scene Recreation mode) */}
                            {isSceneRecreationMode && characters.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium flex items-center gap-2">
                                            <Users className="w-4 h-4 text-blue-500" />
                                            Characters in Scene
                                        </Label>
                                        <span className="text-xs text-slate-400">
                                            {sceneCharacters.filter(c => c.isIncluded).length} selected
                                        </span>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2">
                                        {sceneCharacters.map(char => (
                                            <Popover 
                                                key={char.id} 
                                                open={editingCharacterId === char.id}
                                                onOpenChange={(open) => {
                                                    if (open) {
                                                        setEditingCharacterId(char.id)
                                                        setEditAction(char.action)
                                                        setEditEmotion(char.emotion)
                                                    } else {
                                                        setEditingCharacterId(null)
                                                    }
                                                }}
                                            >
                                                <PopoverTrigger asChild>
                                                    <button
                                                        className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all hover:shadow-md ${
                                                            char.isIncluded 
                                                                ? char.isModified 
                                                                    ? 'border-blue-400 bg-blue-50' 
                                                                    : 'border-green-400 bg-green-50'
                                                                : 'border-slate-200 bg-slate-50 opacity-60'
                                                        }`}
                                                    >
                                                        {/* Avatar Container - relative for badge positioning */}
                                                        <div className="relative">
                                                            {/* Avatar Circle */}
                                                            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200">
                                                                {char.imageUrl ? (
                                                                    <img 
                                                                        src={char.imageUrl} 
                                                                        alt={char.name} 
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                                        <Users className="w-6 h-6" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* Status indicator - positioned outside the overflow-hidden div */}
                                                            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${
                                                                char.isIncluded 
                                                                    ? char.isModified 
                                                                        ? 'bg-blue-500' 
                                                                        : 'bg-green-500'
                                                                    : 'bg-slate-400'
                                                            }`}>
                                                                {char.isIncluded ? (
                                                                    char.isModified ? (
                                                                        <Pencil className="w-2.5 h-2.5 text-white" />
                                                                    ) : (
                                                                        <Check className="w-3 h-3 text-white" />
                                                                    )
                                                                ) : (
                                                                    <Plus className="w-3 h-3 text-white" />
                                                                )}
                                                            </div>
                                                        </div>
                                                        {/* Name */}
                                                        <span className={`text-xs font-medium max-w-[70px] truncate ${
                                                            char.isIncluded ? 'text-slate-700' : 'text-slate-400'
                                                        }`}>
                                                            {char.name}
                                                        </span>
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-72" align="center">
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 pb-2 border-b">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200">
                                                                {char.imageUrl ? (
                                                                    <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Users className="w-4 h-4 text-slate-400 m-2" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-sm">{char.isIncluded ? 'Edit' : 'Add'} {char.name}</p>
                                                                <p className="text-xs text-slate-400">
                                                                    {char.isIncluded ? 'Modify action & emotion' : 'Add to scene'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="space-y-2">
                                                            <Label className="text-xs">Action (what are they doing?)</Label>
                                                            <Input
                                                                value={editAction}
                                                                onChange={(e) => setEditAction(e.target.value)}
                                                                placeholder="e.g. sitting at desk, reading a book"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        
                                                        <div className="space-y-2">
                                                            <Label className="text-xs">Emotion</Label>
                                                            <Input
                                                                value={editEmotion}
                                                                onChange={(e) => setEditEmotion(e.target.value)}
                                                                placeholder="e.g. curious, excited, thoughtful"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        
                                                        <div className="flex gap-2 pt-2">
                                                            {char.isIncluded && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                    onClick={() => {
                                                                        setSceneCharacters(prev => prev.map(c => 
                                                                            c.id === char.id 
                                                                                ? { ...c, isIncluded: false, isModified: true }
                                                                                : c
                                                                        ))
                                                                        setEditingCharacterId(null)
                                                                    }}
                                                                >
                                                                    <Minus className="w-3 h-3 mr-1" />
                                                                    Remove
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                className="flex-1"
                                                                disabled={!editAction.trim()}
                                                                onClick={() => {
                                                                    setSceneCharacters(prev => prev.map(c => 
                                                                        c.id === char.id 
                                                                            ? { 
                                                                                ...c, 
                                                                                action: editAction, 
                                                                                emotion: editEmotion,
                                                                                isIncluded: true,
                                                                                isModified: true
                                                                            }
                                                                            : c
                                                                    ))
                                                                    setEditingCharacterId(null)
                                                                }}
                                                            >
                                                                <Check className="w-3 h-3 mr-1" />
                                                                {char.isIncluded ? 'Save' : 'Add'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        ))}
                                    </div>
                                    
                                    {sceneCharacters.filter(c => c.isIncluded).length === 0 && (
                                        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                                            No characters selected. Click on a character to add them to the scene.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsRegenerateDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={async () => {
                                    // Convert uploaded images to base64 (Mode 1/2 only)
                                    const base64Images = !isSceneRecreationMode 
                                        ? await Promise.all(referenceImages.map(img =>
                                            new Promise<string>((resolve, reject) => {
                                                const reader = new FileReader()
                                                reader.onload = () => resolve(reader.result as string)
                                                reader.onerror = reject
                                                reader.readAsDataURL(img.file)
                                            })
                                        ))
                                        : []
                                    
                                    // Get reference URL for Scene Recreation mode
                                    const refUrl = selectedEnvPageId 
                                        ? illustratedPages.find(p => p.id === selectedEnvPageId)?.illustration_url || undefined
                                        : undefined
                                    
                                    // Get included characters for Scene Recreation mode
                                    const includedChars = isSceneRecreationMode 
                                        ? sceneCharacters.filter(c => c.isIncluded)
                                        : undefined
                                    
                                    setIsRegenerateDialogOpen(false)
                                    onRegenerate(regenerationPrompt, base64Images, refUrl, includedChars)
                                }}
                                disabled={isSceneRecreationMode && sceneCharacters.filter(c => c.isIncluded).length === 0}
                                className={
                                    (!regenerationPrompt.trim() && referenceImages.length === 0 && !isSceneRecreationMode) 
                                        ? "bg-red-600 hover:bg-red-700 text-white" 
                                        : isSceneRecreationMode 
                                            ? "bg-purple-600 hover:bg-purple-700 text-white"
                                            : ""
                                }
                            >
                                {(!regenerationPrompt.trim() && referenceImages.length === 0 && !isSceneRecreationMode) 
                                    ? "Reset to Original" 
                                    : isSceneRecreationMode 
                                        ? "Recreate Scene"
                                        : "Regenerate"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}
