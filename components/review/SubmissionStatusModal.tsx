'use client'

import { Loader2, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface SubmissionStatusModalProps {
    isOpen: boolean
    status: 'idle' | 'loading' | 'success'
}

export function SubmissionStatusModal({
    isOpen,
    status
}: SubmissionStatusModalProps) {
    // Prevent closing by clicking outside or pressing escape
    const handleInteractOutside = (e: Event) => {
        e.preventDefault()
    }

    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent
                className="sm:max-w-md [&>button]:hidden pointer-events-none select-none"
                overlayClassName="bg-white/95 backdrop-blur-sm"
                onInteractOutside={handleInteractOutside}
                onEscapeKeyDown={handleInteractOutside}
            >
                <div className="flex flex-col items-center justify-center py-8 text-center px-4 pointer-events-auto">

                    {/* Status Icon */}
                    <div className="mb-6">
                        {status === 'loading' && (
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-blue-100 rounded-full animate-[spin_3s_linear_infinite]" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                </div>
                            </div>
                        )}

                        {status === 'success' && (
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                                <Check className="w-8 h-8 text-green-600" strokeWidth={3} />
                            </div>
                        )}
                    </div>

                    {/* Text Content */}
                    <div className="space-y-4">
                        {status === 'loading' && (
                            <>
                                <DialogTitle className="text-2xl font-bold text-gray-900">
                                    Submitting Changes...
                                </DialogTitle>
                                <DialogDescription className="space-y-2 text-base" asChild>
                                    <div>
                                        <p className="text-gray-600 font-medium">
                                            Please do NOT close your browser window.
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            We are processing your character details and manuscript updates.
                                        </p>
                                    </div>
                                </DialogDescription>
                            </>
                        )}

                        {status === 'success' && (
                            <>
                                <DialogTitle className="text-2xl font-bold text-gray-900">
                                    Changes Submitted Successfully
                                </DialogTitle>
                                <DialogDescription className="space-y-4 pt-2 text-base text-gray-600" asChild>
                                    <div>
                                        <p>
                                            Thank you for submitting your character information and story updates.
                                        </p>
                                        <p>
                                            Our illustrators will now create the character illustrations based on your specifications. You will be notified once the illustrations are complete.
                                        </p>
                                    </div>
                                </DialogDescription>
                            </>
                        )}
                    </div>

                </div>
            </DialogContent>
        </Dialog>
    )
}
