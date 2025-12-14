import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, MessageSquare, Loader2, X, Save } from 'lucide-react'
import { Page } from '@/types/page'
import { toast } from 'sonner'

interface ReviewHistoryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    page: Page
    reviews?: any[]
    onSave?: (notes: string) => Promise<void>
    canEdit?: boolean
}

export function ReviewHistoryDialog({ open, onOpenChange, page, reviews = [], onSave, canEdit }: ReviewHistoryDialogProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editText, setEditText] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const startEditing = () => {
        setEditText(page.feedback_notes || '')
        setIsEditing(true)
    }

    const handleSave = async () => {
        if (!onSave) return
        if (!editText.trim()) {
            setIsEditing(false)
            return
        }

        setIsSaving(true)
        try {
            await onSave(editText)
            setIsEditing(false)
            toast.success('Request updated')
        } catch (error) {
            toast.error('Failed to update request')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val) setIsEditing(false) // Reset on close
            onOpenChange(val)
        }}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md transition-all duration-300">
                <DialogHeader className="border-b pb-4 mb-4">
                    <DialogTitle>Review History</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 0. New Request (Add Button) */}
                    {canEdit && !page.feedback_notes && (
                        <div className="mb-4">
                            {!isEditing ? (
                                <Button onClick={() => { setEditText(''); setIsEditing(true) }} className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold">
                                    <MessageSquare className="w-4 h-4" />
                                    Add Edits
                                </Button>
                            ) : (
                                <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm animate-in fade-in zoom-in-95">
                                    <h4 className="text-xs font-bold text-blue-700 uppercase mb-2">New Request</h4>
                                    <Textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="min-h-[100px] mb-3 border-blue-200 focus-visible:ring-blue-500"
                                        placeholder="Describe what needs to be changed..."
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-slate-700">Cancel</Button>
                                        <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Save className="w-3 h-3 mr-1.5" />}
                                            Save Request
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 1. Current Open Request (Editable) */}
                    {page.feedback_notes && !page.is_resolved && (
                        <div className={`bg-amber-50 border border-amber-100 rounded-md p-4 text-sm text-amber-900 shadow-sm relative group transition-all duration-300 ${isEditing ? 'ring-2 ring-amber-200 bg-white' : ''}`}>

                            {/* Header / Title */}
                            <div className="flex items-start gap-3 mb-2">
                                <MessageSquare className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <span className="text-xs font-bold text-amber-700 uppercase block">Your Request:</span>
                                </div>
                                {/* Edit Button (Top Right) - Only show if not editing */}
                                {canEdit && !isEditing && (
                                    <button
                                        onClick={startEditing}
                                        className="text-xs font-semibold text-amber-600 hover:text-amber-800 transition-colors uppercase px-2 py-1 -mt-1 -mr-2 rounded hover:bg-amber-100"
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>

                            {/* Content or Editor */}
                            {isEditing ? (
                                <div className="mt-2 animate-in fade-in zoom-in-95 duration-200">
                                    <Textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="min-h-[100px] bg-white border-amber-200 focus-visible:ring-amber-500 mb-3"
                                        placeholder="Describe your changes..."
                                    />
                                    <div className="flex justify-end gap-3 mt-4">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setIsEditing(false)}
                                            className="text-slate-600 border-slate-200"
                                            disabled={isSaving}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                                            style={{ backgroundColor: '#d97706', color: '#ffffff' }}
                                        >
                                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Save className="w-3 h-3 mr-1.5" />}
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap leading-relaxed pl-8 -mt-1">{page.feedback_notes}</p>
                            )}
                        </div>
                    )}

                    {/* 2. Last Resolved (Ready to Resend state) */}
                    {page.feedback_notes && page.is_resolved && (
                        <div className="bg-green-50 border border-green-200 rounded-md p-4 text-sm text-green-900 shadow-sm">
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                                <div>
                                    <span className="text-xs font-bold text-green-700 uppercase block mb-1">Resolved (Ready)</span>
                                    <p className="whitespace-pre-wrap leading-relaxed">{page.feedback_notes}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. History */}
                    {/* @ts-ignore */}
                    {page.feedback_history?.slice().reverse().map((item: any, index: number) => (
                        <div key={`hist-${index}`} className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm flex items-start gap-2 opacity-90 hover:opacity-100 transition-opacity">
                            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                            <p className="leading-relaxed text-slate-700">
                                <span className="font-bold text-slate-500 uppercase text-xs mr-2">Resolved:</span>
                                {item.note}
                            </p>
                        </div>
                    ))}

                    {/* 4. No Reviews */}
                    {!page.feedback_notes && (!page.feedback_history || page.feedback_history.length === 0) && (
                        <div className="text-center py-8 text-slate-400">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No review history for this page yet.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
