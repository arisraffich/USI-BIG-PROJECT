'use client'

import { memo, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Page } from '@/types/page'
import { MessageSquare, MessageSquarePlus, CheckCircle2, Download, Upload, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { PageStatusBar, PageStatus } from '@/components/project/PageStatusBar'
import { ReviewHistoryDialog } from '@/components/project/ReviewHistoryDialog'

interface CustomerIllustrationReviewProps {
    page: Page
    onChange: (id: string, notes: string) => void
}

export const CustomerIllustrationReview = memo(function CustomerIllustrationReview({
    page,
    onChange
}: CustomerIllustrationReviewProps) {
    const [notes, setNotes] = useState(page.feedback_notes || '')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showImage, setShowImage] = useState<string | null>(null) // URL of image to show in lightbox
    const [historyOpen, setHistoryOpen] = useState(false)

    const handleSaveLocal = async () => {
        if (!notes.trim()) {
            setIsEditing(false)
            return
        }

        setIsSaving(true)
        try {
            const response = await fetch(`/api/review/pages/${page.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback_notes: notes }),
            })

            if (!response.ok) {
                throw new Error('Failed to save feedback')
            }

            // Update local parent state to reflect the change visually without reload
            onChange(page.id, notes)

            setIsEditing(false)
            toast.success('Feedback saved successfully')
        } catch (error) {
            console.error('Save error:', error)
            toast.error('Failed to save feedback')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancel = () => {
        setNotes(page.feedback_notes || '')
        setIsEditing(false)
    }

    const handleDownload = (url: string, filename: string) => {
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
        window.location.href = downloadUrl
    }

    if (!page.customer_illustration_url && !page.customer_sketch_url) return (
        <div className="max-w-[1600px] mx-auto min-h-[400px] flex items-center justify-center bg-white rounded-xl border border-slate-200 text-slate-400">
            Pending Illustration Release...
        </div>
    )

    return (
        <div className="max-w-[1600px] mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row min-h-[600px]">

                {/* Left Column: Reviews (Styled like Admin sidebar block) */}
                <div className="hidden md:flex w-72 lg:w-80 flex-col shrink-0 border-r border-slate-100 bg-slate-50/50">
                    <div className="p-4 border-b border-slate-100 h-[73px] flex items-center justify-between">
                        <h4 className="font-semibold text-slate-800">Reviews</h4>
                    </div>

                    <div className="p-4 space-y-4 overflow-y-auto max-h-[800px]">
                        <div className="text-sm text-slate-600 space-y-2 mb-4">
                            <p>
                                Please review line work, composition, and character likeness.
                            </p>
                            <p className="text-xs text-slate-400">
                                Note: Colors and lighting might be adjusted in the final version, but major changes should be requested now.
                            </p>
                        </div>

                        {/* Feedback Logic */}
                        <div className="mt-2">
                            {/* Case 1: Existing Notes (Not Editing) */}
                            {!isEditing && page.feedback_notes && (
                                <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm text-amber-900 relative group animate-in fade-in zoom-in-95 duration-200">
                                    <p className="font-semibold text-xs text-amber-700 uppercase mb-1">Your Request:</p>
                                    <p className="whitespace-pre-wrap">{page.feedback_notes}</p>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="absolute top-1 right-1 h-6 px-2 text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-colors text-xs"
                                        onClick={() => {
                                            setNotes(page.feedback_notes || '')
                                            setIsEditing(true)
                                        }}
                                    >
                                        Edit
                                    </Button>
                                </div>
                            )}

                            {/* Case 2: Editing Mode (Visible Textarea) */}
                            {isEditing ? (
                                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200 bg-white rounded-lg p-3 border border-amber-100 shadow-sm ring-1 ring-amber-50">
                                    <Label className="text-xs font-semibold text-amber-800 uppercase">
                                        Your Request:
                                    </Label>
                                    <Textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Describe what needs to be changed..."
                                        className="min-h-[120px] text-sm resize-none focus-visible:ring-amber-500 border-amber-200 bg-white"
                                        autoFocus
                                    />
                                    <div className="flex gap-3 justify-end mt-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCancel}
                                            className="text-slate-600 hover:bg-slate-50"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleSaveLocal}
                                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                                            style={{ backgroundColor: '#d97706', color: '#ffffff' }}
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                /* Case 3: No Feedback Yet -> Show Blue Button */
                                !page.feedback_notes && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full h-11 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 shadow-sm bg-white font-medium"
                                        onClick={() => setIsEditing(true)}
                                    >
                                        <MessageSquarePlus className="w-4 h-4" />
                                        Request Changes
                                    </Button>
                                )
                            )}
                        </div>

                        {/* History */}
                        {/* @ts-ignore */}
                        {page.feedback_history?.map((item: any, index: number) => (
                            <div key={`hist-${index}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm flex items-start gap-2">
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

                {/* Right Column: Images */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Mobile: Page Status Bar & History */}
                    <div className="md:hidden border-b border-slate-100 bg-white">
                        <div className="px-4 pt-4 pb-2">
                            <h3 className="font-bold text-slate-800">Page {page.page_number}</h3>
                        </div>
                        <PageStatusBar
                            status={page.feedback_notes ? 'pending' : 'resolved'}
                            labelText={
                                page.feedback_notes ? `Pending: ${page.feedback_notes}` : 'Ready for Review'
                            }
                            onStatusClick={() => setHistoryOpen(true)}
                            actionButton={
                                !page.feedback_notes && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsEditing(true)}
                                        className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                                    >
                                        <MessageSquarePlus className="w-4 h-4" />
                                    </Button>
                                )
                            }
                        />
                        <ReviewHistoryDialog
                            open={historyOpen}
                            onOpenChange={setHistoryOpen}
                            page={page}
                            canEdit={true}
                            onSave={async (newNotes) => {
                                // Save to server
                                const response = await fetch(`/api/review/pages/${page.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ feedback_notes: newNotes }),
                                })

                                if (!response.ok) throw new Error('Failed to save')

                                // Update parent state without reload
                                onChange(page.id, newNotes)
                            }}
                        />
                    </div>
                    <div className="hidden md:grid grid-cols-2 divide-x border-b border-slate-100 h-[73px] bg-slate-50">
                        <div className="flex items-center justify-center gap-2 relative">
                            <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                                Pencil Sketch
                            </h4>
                            {page.customer_sketch_url && (
                                <button
                                    onClick={() => handleDownload(page.customer_sketch_url!, `Page-${page.page_number}-Sketch.jpg`)}
                                    className="text-slate-400 hover:text-purple-600 transition-colors ml-2"
                                    title="Download Sketch"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center justify-center gap-2 relative">
                            <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                                Final Illustration
                            </h4>
                            {page.customer_illustration_url && (
                                <button
                                    onClick={() => handleDownload(page.customer_illustration_url!, `Page-${page.page_number}-Illustration.jpg`)}
                                    className="text-slate-400 hover:text-purple-600 transition-colors ml-2"
                                    title="Download Illustration"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Grid: Sketch Left, Illustration Right. Touching. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                        {/* 1. Sketch (First/Left) */}
                        <div className="md:p-0 flex flex-col items-center space-y-4 md:space-y-0 bg-white relative">
                            <div className="flex items-center gap-2 md:hidden p-4">
                                <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Sketch</span>
                            </div>
                            <div
                                className="relative w-full h-full cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => setShowImage(page.customer_sketch_url || null)}
                            >
                                {page.customer_sketch_url ? (
                                    <img
                                        src={page.customer_sketch_url}
                                        alt="Sketch"
                                        className="w-full h-full object-cover grayscale contrast-125 md:shadow-none"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 min-h-[400px]">
                                        <span className="text-sm">No sketch available</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Illustration (Second/Right) */}
                        <div className="md:p-0 flex flex-col items-center space-y-4 md:space-y-0 bg-slate-50/10 relative">
                            <div className="flex items-center gap-2 md:hidden p-4">
                                <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Colored</span>
                            </div>
                            <div
                                className="relative w-full h-full cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => setShowImage(page.customer_illustration_url || null)}
                            >
                                {page.customer_illustration_url ? (
                                    <img
                                        src={page.customer_illustration_url}
                                        alt="Full Illustration"
                                        className="w-full h-full object-cover shadow-lg md:shadow-none"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 min-h-[400px]">
                                        <span className="text-sm">No illustration available</span>
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
        </div >
    )
})
