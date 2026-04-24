'use client'

import { useCallback, useState } from 'react'
import { Download, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import JSZip from 'jszip'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Cover } from '@/types/cover'

interface CoverHeaderActionsProps {
    cover: Cover
    onCoverDeleted: () => void
}

/**
 * Slugify title → safe filename segment. Shared between all filenames in the
 * bundle so admin sees a consistent `{title}-…` prefix everywhere.
 */
function slugify(title: string): string {
    return (
        title
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase() || 'cover'
    )
}

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
    return res.arrayBuffer()
}

/**
 * Icon-only Download + Delete Cover buttons that live in the ProjectHeader
 * when the Cover tab is active. Clicking Download bundles (front PNG + front
 * line art PNG + back PNG if present) into a single zip, all inside one folder.
 */
export function CoverHeaderActions({ cover, onCoverDeleted }: CoverHeaderActionsProps) {
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)

    // Download is available as soon as the front cover exists — back is optional.
    const canDownload = !!cover.front_url

    const handleDownload = useCallback(async () => {
        if (!cover.front_url || isDownloading) return

        const safe = slugify(cover.title)
        const folderName = `${safe}-cover`
        setIsDownloading(true)
        const toastId = 'cover-download'
        toast.loading('Preparing cover bundle (front + line art + back)...', {
            id: toastId,
            duration: 120_000,
        })

        try {
            // 1) Front cover PNG — fetch in parallel with line-art kickoff below.
            const frontBufferPromise = fetchAsArrayBuffer(cover.front_url)

            // 2) Line-art for front cover. Fire in parallel with front fetch.
            //    Don't pass projectId/pageNumber — we don't want to persist this
            //    to storage (covers manage their own assets).
            const lineArtPromise = (async (): Promise<ArrayBuffer | null> => {
                try {
                    const res = await fetch('/api/line-art/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ illustrationUrl: cover.front_url }),
                    })
                    if (!res.ok) {
                        console.warn('[CoverHeaderActions] line-art failed', res.status)
                        return null
                    }
                    return await res.arrayBuffer()
                } catch (err) {
                    console.warn('[CoverHeaderActions] line-art error', err)
                    return null
                }
            })()

            // 3) Back cover PNG if present.
            const backBufferPromise: Promise<ArrayBuffer | null> = cover.back_url
                ? fetchAsArrayBuffer(cover.back_url)
                : Promise.resolve(null)

            const [frontBuffer, lineArtBuffer, backBuffer] = await Promise.all([
                frontBufferPromise,
                lineArtPromise,
                backBufferPromise,
            ])

            // 4) Build the zip — single folder, clean filenames.
            const zip = new JSZip()
            const folder = zip.folder(folderName)!
            folder.file(`${safe}-front.png`, frontBuffer)
            if (lineArtBuffer) {
                folder.file(`${safe}-front-lineart.png`, lineArtBuffer)
            }
            if (backBuffer) {
                folder.file(`${safe}-back.png`, backBuffer)
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' })
            const objUrl = URL.createObjectURL(zipBlob)
            const link = document.createElement('a')
            link.href = objUrl
            link.download = `${folderName}.zip`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(objUrl)

            if (lineArtBuffer) {
                toast.success('Cover bundle downloaded', { id: toastId })
            } else {
                toast.warning('Downloaded — but line art generation failed. Bundle contains cover images only.', {
                    id: toastId,
                    duration: 6000,
                })
            }
        } catch (err) {
            console.error('[CoverHeaderActions] Download failed', err)
            toast.error('Download failed — please try again.', { id: toastId })
        } finally {
            setIsDownloading(false)
        }
    }, [cover.front_url, cover.back_url, cover.title, isDownloading])

    const handleDelete = useCallback(async () => {
        setIsDeleting(true)
        try {
            const res = await fetch(`/api/covers/${cover.id}`, { method: 'DELETE' })
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as { error?: string }))
                throw new Error(data?.error || 'Delete failed')
            }
            onCoverDeleted()
            toast.success('Cover deleted')
            setIsDeleteOpen(false)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Delete failed'
            toast.error(msg)
        } finally {
            setIsDeleting(false)
        }
    }, [cover.id, onCoverDeleted])

    return (
        <>
            <div className="flex items-center gap-1.5">
                {canDownload && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDownload}
                        disabled={isDownloading}
                        title="Download cover bundle (front + line art + back)"
                        aria-label="Download cover bundle"
                        className="h-9 w-9"
                    >
                        {isDownloading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                    </Button>
                )}
                <Button
                    variant="outline"
                    onClick={() => setIsDeleteOpen(true)}
                    disabled={isDownloading}
                    title="Delete cover"
                    aria-label="Delete cover"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300 h-9 w-9 sm:w-auto sm:px-3 sm:gap-2"
                >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Delete Cover</span>
                </Button>
            </div>

            <AlertDialog
                open={isDeleteOpen}
                onOpenChange={(open) => {
                    if (!isDeleting) setIsDeleteOpen(open)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="w-5 h-5" />
                            Delete this cover?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This wipes the entire cover — front, back, title, subtitle, and source reference. You&apos;ll be able to create a new one from any illustration.
                            <br />
                            <br />
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                void handleDelete()
                            }}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete Cover'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
