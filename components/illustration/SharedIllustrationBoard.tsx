'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Page } from '@/types/page'
import { Character } from '@/types/character'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquarePlus, CheckCircle2, Download, Upload, Loader2, Sparkles, Bookmark, X, ChevronDown, ChevronUp, Users, Plus, Minus, Pencil, Check, Layers, CornerDownRight, AlertCircle, ChevronLeft, ChevronRight, BookImage, SlidersHorizontal, RotateCcw, Undo2, Redo2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getErrorMessage } from '@/lib/utils/error'

import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { EmptyStateBoard } from '@/components/illustration/EmptyStateBoard'
import { ReviewHistoryDialog } from '@/components/project/ReviewHistoryDialog'
import { useIllustrationLock } from '@/hooks/use-illustration-lock'
import { CoverModal } from '@/components/illustration/CoverModal'
import { REFRESH_PROMPT } from '@/lib/ai/refresh-prompt'
import { DEFAULT_IMAGE_TUNE_SETTINGS, IMAGE_TUNE_LIMITS } from '@/types/image-tune'
import type { ImageTuneSettings } from '@/types/image-tune'

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

type FeedbackHistoryItem = NonNullable<NonNullable<Page['feedback_history']>[number]>
type FullscreenImageItem = { url: string; label?: string }

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

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

type IllustrationModelId = 'nb2' | 'nb-pro' | 'gpt-2'

const DEFAULT_REMASTER_MODEL: IllustrationModelId = 'gpt-2'

type TuneControl = { key: keyof ImageTuneSettings; label: string }
type TuneControlGroupId = 'tone' | 'color' | 'detail'
type TunePreviewView = 'adjusted' | 'reference'

const TUNE_CONTROL_GROUPS: Array<{ id: TuneControlGroupId; label: string; controls: TuneControl[] }> = [
    {
        id: 'tone',
        label: 'Light & Tone',
        controls: [
            { key: 'exposure', label: 'Exposure' },
            { key: 'brightness', label: 'Brightness' },
            { key: 'contrast', label: 'Contrast' },
            { key: 'midtones', label: 'Midtones' },
            { key: 'shadows', label: 'Shadows' },
            { key: 'highlights', label: 'Highlights' },
        ],
    },
    {
        id: 'color',
        label: 'Color',
        controls: [
            { key: 'saturation', label: 'Saturation' },
            { key: 'vibrance', label: 'Vibrance' },
            { key: 'warmth', label: 'Temperature' },
            { key: 'red', label: 'Red' },
            { key: 'green', label: 'Green' },
            { key: 'blue', label: 'Blue' },
        ],
    },
    {
        id: 'detail',
        label: 'Detail',
        controls: [
            { key: 'clarity', label: 'Clarity' },
            { key: 'dehaze', label: 'Dehaze' },
            { key: 'sharpness', label: 'Sharpness' },
        ],
    },
]

const DEFAULT_TUNE_GROUPS_OPEN: Record<TuneControlGroupId, boolean> = {
    tone: true,
    color: true,
    detail: true,
}

const TUNE_GROUP_HELP_TEXT: Record<TuneControlGroupId, string> = {
    tone: 'light',
    color: 'cast',
    detail: 'texture',
}

const TUNE_GROUP_ACTIVE_CLASS: Record<TuneControlGroupId, string> = {
    tone: 'bg-slate-100 text-slate-700',
    color: 'bg-purple-50 text-purple-700',
    detail: 'bg-blue-50 text-blue-700',
}

const TUNE_SLIDER_ACCENTS: Partial<Record<keyof ImageTuneSettings, string>> = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
}

const TUNE_PREVIEW_MAX_EDGE = 1100

function clampByte(value: number): number {
    return Math.min(255, Math.max(0, Math.round(value)))
}

function clampUnit(value: number): number {
    return Math.min(1, Math.max(0, value))
}

function applyGamma(value: number, gamma: number): number {
    return Math.pow(clampUnit(value / 255), gamma) * 255
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const red = r / 255
    const green = g / 255
    const blue = b / 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const lightness = (max + min) / 2

    if (max === min) return [0, 0, lightness]

    const delta = max - min
    const saturation = lightness > 0.5
        ? delta / (2 - max - min)
        : delta / (max + min)
    let hue = 0

    if (max === red) {
        hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60
    } else if (max === green) {
        hue = ((blue - red) / delta + 2) * 60
    } else {
        hue = ((red - green) / delta + 4) * 60
    }

    return [hue, saturation, lightness]
}

function hueToRgb(p: number, q: number, t: number): number {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const hue = (((h % 360) + 360) % 360) / 360
    if (s === 0) {
        const gray = l * 255
        return [gray, gray, gray]
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    return [
        hueToRgb(p, q, hue + 1 / 3) * 255,
        hueToRgb(p, q, hue) * 255,
        hueToRgb(p, q, hue - 1 / 3) * 255,
    ]
}

function applyTuneSettingsToPreview(imageData: ImageData, settings: ImageTuneSettings): ImageData {
    const { data, width, height } = imageData
    const output = new Uint8ClampedArray(data.length)
    const exposureFactor = Math.pow(2, settings.exposure / 60)
    const contrastFactor = 1 + settings.contrast / 100 + settings.dehaze / 160
    const saturationFactor = 1 + settings.saturation / 100 + settings.dehaze / 180
    const gamma = Math.pow(2, -settings.midtones / 60)
    const clarityStrength = settings.clarity / 100

    for (let index = 0; index < data.length; index += 4) {
        let r = data[index] * exposureFactor
        let g = data[index + 1] * exposureFactor
        let b = data[index + 2] * exposureFactor
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const shadowMask = Math.pow(Math.min(1, Math.max(0, (0.58 - luminance) / 0.58)), 1.25)
        const highlightMask = Math.pow(Math.min(1, Math.max(0, (luminance - 0.42) / 0.58)), 1.25)
        const lightnessOffset = settings.brightness * 1.35
            + settings.shadows * 1.2 * shadowMask
            + settings.highlights * 1.05 * highlightMask
            - settings.dehaze * 0.22

        r += lightnessOffset
        g += lightnessOffset
        b += lightnessOffset

        if (settings.midtones !== 0) {
            r = applyGamma(r, gamma)
            g = applyGamma(g, gamma)
            b = applyGamma(b, gamma)
        }

        r = (r - 128) * contrastFactor + 128
        g = (g - 128) * contrastFactor + 128
        b = (b - 128) * contrastFactor + 128

        if (settings.clarity !== 0) {
            const clarityLuminance = clampUnit((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
            const midtoneMask = Math.pow(1 - Math.min(1, Math.abs(clarityLuminance - 0.5) * 2), 0.8)
            const clarityFactor = 1 + clarityStrength * midtoneMask
            r = (r - 128) * clarityFactor + 128
            g = (g - 128) * clarityFactor + 128
            b = (b - 128) * clarityFactor + 128
        }

        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
        r = gray + (r - gray) * saturationFactor
        g = gray + (g - gray) * saturationFactor
        b = gray + (b - gray) * saturationFactor

        if (settings.vibrance !== 0) {
            const [h, s, l] = rgbToHsl(
                Math.min(255, Math.max(0, r)),
                Math.min(255, Math.max(0, g)),
                Math.min(255, Math.max(0, b))
            )
            const vibranceAmount = settings.vibrance / 100
            const nextS = settings.vibrance > 0
                ? clampUnit(s * (1 + vibranceAmount * (1 - s)))
                : clampUnit(s * (1 + vibranceAmount))
            const vibrant = hslToRgb(h, nextS, l)
            r = vibrant[0]
            g = vibrant[1]
            b = vibrant[2]
        }

        r += settings.warmth * 0.8
        g += settings.warmth * 0.12
        b -= settings.warmth * 0.75

        r += settings.red * 1.2
        g += settings.green * 1.2
        b += settings.blue * 1.2

        output[index] = clampByte(r)
        output[index + 1] = clampByte(g)
        output[index + 2] = clampByte(b)
        output[index + 3] = data[index + 3]
    }

    if (settings.sharpness > 0) {
        const sharpened = new Uint8ClampedArray(output)
        const amount = (settings.sharpness / 30) * 1.65

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4
                for (let channel = 0; channel < 3; channel++) {
                    const center = output[index + channel]
                    const blur = (
                        output[index - width * 4 + channel] +
                        output[index + width * 4 + channel] +
                        output[index - 4 + channel] +
                        output[index + 4 + channel] +
                        output[index - width * 4 - 4 + channel] +
                        output[index - width * 4 + 4 + channel] +
                        output[index + width * 4 - 4 + channel] +
                        output[index + width * 4 + 4 + channel]
                    ) / 8
                    sharpened[index + channel] = clampByte(center + (center - blur) * amount)
                }
            }
        }

        imageData.data.set(sharpened)
        return imageData
    }

    imageData.data.set(output)
    return imageData
}

function drawTunedPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, settings: ImageTuneSettings): void {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Preview canvas is not available')

    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const scale = Math.min(1, TUNE_PREVIEW_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    context.putImageData(applyTuneSettingsToPreview(imageData, settings), 0, 0)
}

function areTuneSettingsEqual(a: ImageTuneSettings, b: ImageTuneSettings): boolean {
    return Object.keys(IMAGE_TUNE_LIMITS).every(key => a[key as keyof ImageTuneSettings] === b[key as keyof ImageTuneSettings])
}

export interface SharedIllustrationBoardProps {
    page: Page
    mode: 'admin' | 'customer'
    projectId?: string
    illustrationStatus?: 'draft' | 'illustration_approved' | 'completed'
    projectStatus?: string // Main status field - used for lock logic
    illustrationSendCount?: number // For round-based history display
    onSaveFeedback: (notes: string) => Promise<void>
    isGenerating?: boolean
    isUploading?: boolean
    loadingState?: { sketch: boolean, illustration: boolean }
    aspectRatio?: string
    setAspectRatio?: (ratio: string) => void
    textIntegration?: string
    setTextIntegration?: (text: string) => void
    illustrationType?: 'spread' | 'spot' | null
    setIllustrationType?: (type: 'spread' | 'spot' | null) => void
    onGenerate?: () => void
    onRegenerate?: (prompt: string, referenceImages?: string[], referenceImageUrl?: string, sceneCharacters?: SceneCharacter[], useThinking?: boolean, modelId?: string, isRefresh?: boolean) => void
    onAutoTune?: (settings: ImageTuneSettings) => void
    onLayoutChange?: (newType: 'spread' | 'spot' | null) => void // For changing layout type (triggers regeneration)
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
    
    // Comparison Mode (Regeneration Preview)
    comparisonState?: {
        pageId: string
        oldUrl: string
        newUrl: string
        isAutoTune?: boolean
    }
    onComparisonDecision?: (decision: 'keep_new' | 'revert_old' | 'keep_editing') => void
    
    // Admin Reply Feature
    onSaveAdminReply?: (reply: string) => Promise<void>
    onEditAdminReply?: (reply: string) => Promise<void>
    onAcceptAdminReply?: () => Promise<void>
    onCustomerFollowUp?: (notes: string) => Promise<void>
    onEditFollowUp?: (notes: string) => Promise<void>
    // Admin Comment Feature (for resolved revisions)
    onAddComment?: (comment: string) => Promise<void>
    onRemoveComment?: () => Promise<void>
    // Admin Manual Resolve Feature
    onManualResolve?: () => Promise<void>
    // Customer Display Settings
    showColoredToCustomer?: boolean
    approvalStage?: 'sketch' | 'illustration'
    approvalApprovedCount?: number
    approvalTotalCount?: number
    approvalAllApproved?: boolean
    onApprovePage?: () => Promise<void>
    // Sketch/Story Toggle "All Pages" (Admin only)
    globalSketchViewMode?: { mode: 'sketch' | 'text'; version: number }
    onToggleAllSketchView?: (mode: 'sketch' | 'text') => void

    // Cover Module (Admin only) — hide "Create Cover" button once one exists;
    // propagate the new cover back up-tree on success so the parent can surface the Cover tab.
    hasCover?: boolean
    onCoverCreated?: (cover: import('@/types/cover').Cover) => void
}

export function SharedIllustrationBoard({
    page,
    mode,
    projectId,
    projectStatus,
    illustrationSendCount = 0,
    onSaveFeedback,
    isGenerating = false,
    loadingState = { sketch: false, illustration: false },
    aspectRatio,
    setAspectRatio,
    textIntegration,
    setTextIntegration,
    illustrationType = null,
    setIllustrationType,
    onGenerate,
    onRegenerate,
    onAutoTune,
    onLayoutChange,
    onUpload,
    illustratedPages = [],
    characters = [],
    allPages,
    onGenerateAllRemaining,
    onCancelBatch,
    batchState,
    generationError,
    comparisonState,
    onComparisonDecision,
    // Admin Reply Feature
    onSaveAdminReply,
    onEditAdminReply,
    onAcceptAdminReply,
    onCustomerFollowUp,
    onEditFollowUp,
    // Admin Comment Feature (for resolved revisions)
    onAddComment,
    onRemoveComment,
    // Admin Manual Resolve Feature
    onManualResolve,
    // Customer Display Settings
    showColoredToCustomer = false,
    approvalStage,
    approvalApprovedCount = 0,
    approvalTotalCount = 0,
    onApprovePage,
    // Sketch/Story Toggle "All Pages"
    globalSketchViewMode,
    onToggleAllSketchView,
    // Cover Module
    hasCover = false,
    onCoverCreated,
}: SharedIllustrationBoardProps) {

    // --------------------------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------------------------
    const stripHtml = (html: string) => {
        if (!html) return ''
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    }

    // --------------------------------------------------------------------------
    // LOCAL STATE
    // --------------------------------------------------------------------------
    const [notes, setNotes] = useState(page.feedback_notes || '')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [fullscreenImages, setFullscreenImages] = useState<FullscreenImageItem[]>([])
    const [fullscreenImageIndex, setFullscreenImageIndex] = useState(0)
    const [historyOpen, setHistoryOpen] = useState(false) // For mobile popup
    const [inlineHistoryExpanded, setInlineHistoryExpanded] = useState(false) // For desktop inline collapsible
    
    // Admin Reply State
    const [isAdminReplying, setIsAdminReplying] = useState(false)
    const [isEditingAdminReply, setIsEditingAdminReply] = useState(false)
    const [adminReplyText, setAdminReplyText] = useState('')
    const [isSavingAdminReply, setIsSavingAdminReply] = useState(false)
    // Customer Follow-up State
    const [isCustomerFollowingUp, setIsCustomerFollowingUp] = useState(false)
    const [isEditingFollowUp, setIsEditingFollowUp] = useState(false)
    const [followUpText, setFollowUpText] = useState('')
    const [isSavingFollowUp, setIsSavingFollowUp] = useState(false)
    const [isAccepting, setIsAccepting] = useState(false)
    const [conversationExpanded, setConversationExpanded] = useState(false) // For conversation thread
    // Admin Comment State (for resolved revisions)
    const [isAddingComment, setIsAddingComment] = useState(false)
    const [isDeletingComment, setIsDeletingComment] = useState(false)
    // Admin Manual Resolve State
    const [showResolveDialog, setShowResolveDialog] = useState(false)
    const [isResolving, setIsResolving] = useState(false)
    const [showApprovalDialog, setShowApprovalDialog] = useState(false)
    const [isApprovingPage, setIsApprovingPage] = useState(false)
    const historyDropdownRef = useRef<HTMLDivElement>(null) // For click-outside collapse
    const feedbackSectionRef = useRef<HTMLDivElement>(null) // For auto-scroll to buttons

    // NEW: View Mode for Sketch Card
    const [sketchViewMode, setSketchViewMode] = useState<'sketch' | 'text'>('sketch')
    const [sketchTogglePopoverOpen, setSketchTogglePopoverOpen] = useState(false)
    const pendingSketchModeRef = useRef<'sketch' | 'text'>('sketch')
    const sketchPopoverDesktopRef = useRef<HTMLDivElement>(null)
    const sketchPopoverMobileRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (globalSketchViewMode && globalSketchViewMode.version > 0) {
            setSketchViewMode(globalSketchViewMode.mode)
        }
    }, [globalSketchViewMode])

    useEffect(() => {
        if (!sketchTogglePopoverOpen) return
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            const insideDesktop = sketchPopoverDesktopRef.current?.contains(target)
            const insideMobile = sketchPopoverMobileRef.current?.contains(target)
            if (!insideDesktop && !insideMobile) {
                setSketchTogglePopoverOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [sketchTogglePopoverOpen])

    // Admin: Editable Scene Description
    const [editedSceneNotes, setEditedSceneNotes] = useState(page.scene_description || '')
    const [isSavingSceneNotes, setIsSavingSceneNotes] = useState(false)
    const hasSceneNotesChanged = editedSceneNotes !== (page.scene_description || '')

    // Admin: Regenerate Logic
    const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false)
    const [regenerationPrompt, setRegenerationPrompt] = useState('')
    const [referenceImages, setReferenceImages] = useState<{ file: File; preview: string }[]>([])
    const [isRemasterDialogOpen, setIsRemasterDialogOpen] = useState(false)
    const [remasterModel, setRemasterModel] = useState<IllustrationModelId>(DEFAULT_REMASTER_MODEL)
    const [remasterPrompt, setRemasterPrompt] = useState(REFRESH_PROMPT)
    const [isRemasterPromptOpen, setIsRemasterPromptOpen] = useState(false)
    const [remasterReferencePageId, setRemasterReferencePageId] = useState<string | null>(null)
    const [remasterUpload, setRemasterUpload] = useState<{ file: File; preview: string } | null>(null)
    const [isTuneMode, setIsTuneMode] = useState(false)
    const [tunePreviewView, setTunePreviewView] = useState<TunePreviewView>('adjusted')
    const [tuneReferencePageId, setTuneReferencePageId] = useState<string | null>(null)
    const [tuneSettings, setTuneSettings] = useState<ImageTuneSettings>(DEFAULT_IMAGE_TUNE_SETTINGS)
    const [isTunePreviewLoading, setIsTunePreviewLoading] = useState(false)
    const [tunePreviewError, setTunePreviewError] = useState<string | null>(null)
    const [tuneUndoCount, setTuneUndoCount] = useState(0)
    const [tuneRedoCount, setTuneRedoCount] = useState(0)
    const [tuneSourceVersion, setTuneSourceVersion] = useState(0)
    const [openTuneGroups, setOpenTuneGroups] = useState<Record<TuneControlGroupId, boolean>>(DEFAULT_TUNE_GROUPS_OPEN)
    const tuneCanvasRef = useRef<HTMLCanvasElement>(null)
    const tuneSourceImageRef = useRef<HTMLImageElement | null>(null)
    const tuneSettingsRef = useRef<ImageTuneSettings>(DEFAULT_IMAGE_TUNE_SETTINGS)
    const tuneUndoStackRef = useRef<ImageTuneSettings[]>([])
    const tuneRedoStackRef = useRef<ImageTuneSettings[]>([])
    const tuneSliderInteractionRef = useRef<{ key: keyof ImageTuneSettings; before: ImageTuneSettings } | null>(null)
    const tuneSliderCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    
    // Admin: Layout Change Dialog
    const [isLayoutDialogOpen, setIsLayoutDialogOpen] = useState(false)
    const [selectedLayoutType, setSelectedLayoutType] = useState<'spread' | 'spot' | null>(null)
    
    // Error display state
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
    
    // Line Art Generation State
    const [isGeneratingLineArt, setIsGeneratingLineArt] = useState(false)

    // Cover Generation Modal State
    const [isCoverModalOpen, setIsCoverModalOpen] = useState(false)
    
    // Reset to Original state
    const [isResettingToOriginal, setIsResettingToOriginal] = useState(false)
    const hasOriginal = !!page.original_illustration_url
    const isShowingOriginal = hasOriginal && page.illustration_url === page.original_illustration_url

    // NEW: Environment Reference & Character Control (Mode 3/4)
    const [selectedEnvPageId, setSelectedEnvPageId] = useState<string | null>(null)
    const [sceneCharacters, setSceneCharacters] = useState<SceneCharacter[]>([])
    const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
    const [editAction, setEditAction] = useState('')
    const [editEmotion, setEditEmotion] = useState('')
    const [promptWasAutoPopulated, setPromptWasAutoPopulated] = useState(false)
    const [useThinkingMode, setUseThinkingMode] = useState(false)
    const [illustrationModel, setIllustrationModel] = useState<IllustrationModelId>('nb2')
    
    const ENV_AUTO_PROMPT = 'Use the same environment as in the reference image. Keep all characters and composition the same.'
    
    // Handle environment reference selection with auto-prompt
    const handleEnvSelect = (envPageId: string | null) => {
        setSelectedEnvPageId(envPageId)
        if (envPageId) {
            // Selecting an environment: auto-populate prompt if empty or was previously auto-populated
            if (!regenerationPrompt.trim() || promptWasAutoPopulated) {
                setRegenerationPrompt(ENV_AUTO_PROMPT)
                setPromptWasAutoPopulated(true)
            }
        } else {
            // Deselecting environment: clear only if prompt was auto-populated
            if (promptWasAutoPopulated) {
                setRegenerationPrompt('')
                setPromptWasAutoPopulated(false)
            }
        }
    }

    // Measure the split-button wrapper so the dropdown panel width matches it
    const regenerateSplitRef = useRef<HTMLDivElement>(null)
    const [regenerateSplitWidth, setRegenerateSplitWidth] = useState<number | null>(null)
    useEffect(() => {
        if (!regenerateSplitRef.current) return
        const el = regenerateSplitRef.current
        const update = () => setRegenerateSplitWidth(el.offsetWidth)
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Same measurement for the mobile split-button (lives in the purple header)
    const regenerateSplitMobileRef = useRef<HTMLDivElement>(null)
    const [regenerateSplitMobileWidth, setRegenerateSplitMobileWidth] = useState<number | null>(null)
    useEffect(() => {
        if (!regenerateSplitMobileRef.current) return
        const el = regenerateSplitMobileRef.current
        const update = () => setRegenerateSplitMobileWidth(el.offsetWidth)
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const remasterFileInputRef = useRef<HTMLInputElement>(null)

    const resetRemasterOptions = useCallback(() => {
        setRemasterModel(DEFAULT_REMASTER_MODEL)
        setRemasterPrompt(REFRESH_PROMPT)
        setIsRemasterPromptOpen(false)
        setRemasterReferencePageId(null)
        setRemasterUpload(null)
        if (remasterFileInputRef.current) remasterFileInputRef.current.value = ''
    }, [])

    const handleOpenRemasterDialog = useCallback(() => {
        if (!onRegenerate || !page.illustration_url) return
        resetRemasterOptions()
        setIsRemasterDialogOpen(true)
    }, [onRegenerate, page.illustration_url, resetRemasterOptions])

    const handleOpenTuneMode = useCallback(() => {
        if (!onAutoTune || !page.illustration_url) return
        setTuneSettings(DEFAULT_IMAGE_TUNE_SETTINGS)
        setTunePreviewError(null)
        tuneSettingsRef.current = DEFAULT_IMAGE_TUNE_SETTINGS
        tuneUndoStackRef.current = []
        tuneRedoStackRef.current = []
        tuneSliderInteractionRef.current = null
        if (tuneSliderCommitTimeoutRef.current) {
            clearTimeout(tuneSliderCommitTimeoutRef.current)
            tuneSliderCommitTimeoutRef.current = null
        }
        setTuneUndoCount(0)
        setTuneRedoCount(0)
        setOpenTuneGroups(DEFAULT_TUNE_GROUPS_OPEN)
        setIsTunePreviewLoading(true)
        setIsTuneMode(true)
    }, [onAutoTune, page.illustration_url])

    // Handler to open regenerate dialog with saved prompt or customer feedback pre-populated
    const handleOpenRegenerateDialog = () => {
        // Current customer feedback for this round (only if unresolved)
        const currentFeedback = (page.feedback_notes && !page.is_resolved) ? page.feedback_notes : ''
        
        // Check localStorage for admin's edited prompt from the same round
        // Stored as JSON { prompt, feedbackKey } — only valid if feedbackKey matches current feedback
        let savedPrompt: string | null = null
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(`regen-prompt-${page.id}`)
                if (stored) {
                    const parsed = JSON.parse(stored)
                    if (parsed.feedbackKey === currentFeedback) {
                        savedPrompt = parsed.prompt
                    } else {
                        // Stale prompt from a previous round — clean up
                        localStorage.removeItem(`regen-prompt-${page.id}`)
                    }
                }
            } catch {
                localStorage.removeItem(`regen-prompt-${page.id}`)
            }
        }
        
        setRegenerationPrompt(savedPrompt || currentFeedback)
        setIsRegenerateDialogOpen(true)
    }

    // Handler to open layout dialog with current type pre-selected
    const handleOpenLayoutDialog = () => {
        // Get current illustration type from page data
        const currentType = page.illustration_type || (page.is_spread ? 'spread' : null)
        setSelectedLayoutType(currentType)
        setIsLayoutDialogOpen(true)
    }

    // Get current illustration type for display
    const currentIllustrationType = page.illustration_type || (page.is_spread ? 'spread' : null)

    // Refs for hidden inputs
    const sketchInputRef = useRef<HTMLInputElement>(null)
    const illustrationInputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null) // For Reference Images

    const isAdmin = mode === 'admin'
    const isCustomer = mode === 'customer'

    const selectedRemasterReferencePage = remasterReferencePageId
        ? illustratedPages.find(p => p.id === remasterReferencePageId)
        : undefined

    const tuneReferenceOptions = useMemo(() => {
        const optionsById = new Map<string, Page>()
        const addPage = (candidate?: Page | null) => {
            if (!candidate?.id || !candidate.illustration_url || optionsById.has(candidate.id)) return
            optionsById.set(candidate.id, candidate)
        }

        addPage(page)
        allPages?.forEach(addPage)
        illustratedPages.forEach(addPage)

        return Array.from(optionsById.values()).sort((a, b) => a.page_number - b.page_number)
    }, [allPages, illustratedPages, page])

    const selectedTuneReferencePage = tuneReferencePageId
        ? tuneReferenceOptions.find(option => option.id === tuneReferencePageId) || page
        : page
    const tuneReferenceUrl = selectedTuneReferencePage.illustration_url || page.illustration_url || ''

    const currentFullscreenImage = fullscreenImages[fullscreenImageIndex] || null
    const canNavigateFullscreenImages = fullscreenImages.length > 1

    const openFullscreenImage = useCallback((items: FullscreenImageItem[], index = 0) => {
        const validItems = items.filter(item => item.url)
        if (validItems.length === 0) return
        setFullscreenImages(validItems)
        setFullscreenImageIndex(Math.min(Math.max(index, 0), validItems.length - 1))
    }, [])

    const closeFullscreenImage = useCallback(() => {
        setFullscreenImages([])
        setFullscreenImageIndex(0)
    }, [])

    const showPreviousFullscreenImage = useCallback(() => {
        setFullscreenImageIndex(index => Math.max(0, index - 1))
    }, [])

    const showNextFullscreenImage = useCallback(() => {
        setFullscreenImageIndex(index => Math.min(fullscreenImages.length - 1, index + 1))
    }, [fullscreenImages.length])

    const tunePreviewFilter = useMemo(() => {
        const brightness = 1
            + tuneSettings.exposure / 90
            + tuneSettings.brightness / 120
            + tuneSettings.midtones / 250
            + tuneSettings.shadows / 350
            + tuneSettings.highlights / 500
            - tuneSettings.dehaze / 450
        const contrast = 1 + tuneSettings.contrast / 120 + tuneSettings.clarity / 180 + tuneSettings.dehaze / 160
        const saturation = 1 + tuneSettings.saturation / 100 + tuneSettings.vibrance / 140 + tuneSettings.dehaze / 180
        const warmth = tuneSettings.warmth
        const sepia = Math.max(0, warmth) / 160
        const warmthHueRotate = warmth < 0 ? warmth / 2 : warmth / 8

        return `brightness(${Math.max(0.5, brightness)}) contrast(${Math.max(0.5, contrast)}) saturate(${Math.max(0.2, saturation)}) sepia(${sepia}) hue-rotate(${warmthHueRotate}deg)`
    }, [tuneSettings])

    const setTuneSettingsSynced = useCallback((nextSettings: ImageTuneSettings) => {
        tuneSettingsRef.current = nextSettings
        setTuneSettings(nextSettings)
    }, [])

    const pushTuneUndoState = useCallback((previousSettings: ImageTuneSettings, nextSettings: ImageTuneSettings) => {
        if (areTuneSettingsEqual(previousSettings, nextSettings)) return

        tuneUndoStackRef.current = [...tuneUndoStackRef.current.slice(-49), previousSettings]
        tuneRedoStackRef.current = []
        setTuneUndoCount(tuneUndoStackRef.current.length)
        setTuneRedoCount(0)
    }, [])

    const clearTuneSliderCommitTimer = useCallback(() => {
        if (!tuneSliderCommitTimeoutRef.current) return
        clearTimeout(tuneSliderCommitTimeoutRef.current)
        tuneSliderCommitTimeoutRef.current = null
    }, [])

    const beginTuneSliderInteraction = useCallback((key: keyof ImageTuneSettings) => {
        const currentInteraction = tuneSliderInteractionRef.current
        if (currentInteraction?.key === key) return

        if (currentInteraction) {
            pushTuneUndoState(currentInteraction.before, tuneSettingsRef.current)
        }

        tuneSliderInteractionRef.current = { key, before: tuneSettingsRef.current }
    }, [pushTuneUndoState])

    const commitTuneSliderInteraction = useCallback(() => {
        clearTuneSliderCommitTimer()

        const interaction = tuneSliderInteractionRef.current
        if (!interaction) return

        tuneSliderInteractionRef.current = null
        pushTuneUndoState(interaction.before, tuneSettingsRef.current)
    }, [clearTuneSliderCommitTimer, pushTuneUndoState])

    const scheduleTuneSliderCommit = useCallback(() => {
        clearTuneSliderCommitTimer()
        tuneSliderCommitTimeoutRef.current = setTimeout(() => {
            tuneSliderCommitTimeoutRef.current = null

            const interaction = tuneSliderInteractionRef.current
            if (!interaction) return

            tuneSliderInteractionRef.current = null
            pushTuneUndoState(interaction.before, tuneSettingsRef.current)
        }, 350)
    }, [clearTuneSliderCommitTimer, pushTuneUndoState])

    const applyTuneSettingsChange = useCallback((nextSettings: ImageTuneSettings) => {
        commitTuneSliderInteraction()

        const currentSettings = tuneSettingsRef.current
        if (areTuneSettingsEqual(currentSettings, nextSettings)) return

        pushTuneUndoState(currentSettings, nextSettings)
        setTuneSettingsSynced(nextSettings)
    }, [commitTuneSliderInteraction, pushTuneUndoState, setTuneSettingsSynced])

    const undoTuneChange = useCallback(() => {
        commitTuneSliderInteraction()

        const previousSettings = tuneUndoStackRef.current.at(-1)
        if (!previousSettings) return

        const currentSettings = tuneSettingsRef.current
        tuneUndoStackRef.current = tuneUndoStackRef.current.slice(0, -1)
        tuneRedoStackRef.current = [...tuneRedoStackRef.current.slice(-49), currentSettings]
        setTuneUndoCount(tuneUndoStackRef.current.length)
        setTuneRedoCount(tuneRedoStackRef.current.length)
        setTuneSettingsSynced(previousSettings)
    }, [commitTuneSliderInteraction, setTuneSettingsSynced])

    const redoTuneChange = useCallback(() => {
        commitTuneSliderInteraction()

        const nextSettings = tuneRedoStackRef.current.at(-1)
        if (!nextSettings) return

        const currentSettings = tuneSettingsRef.current
        tuneRedoStackRef.current = tuneRedoStackRef.current.slice(0, -1)
        tuneUndoStackRef.current = [...tuneUndoStackRef.current.slice(-49), currentSettings]
        setTuneRedoCount(tuneRedoStackRef.current.length)
        setTuneUndoCount(tuneUndoStackRef.current.length)
        setTuneSettingsSynced(nextSettings)
    }, [commitTuneSliderInteraction, setTuneSettingsSynced])

    const resetTuneSettings = useCallback(() => {
        applyTuneSettingsChange(DEFAULT_IMAGE_TUNE_SETTINGS)
    }, [applyTuneSettingsChange])

    const updateTuneSetting = useCallback((key: keyof ImageTuneSettings, value: number) => {
        const limit = IMAGE_TUNE_LIMITS[key]
        const nextValue = Math.min(limit.max, Math.max(limit.min, value))
        beginTuneSliderInteraction(key)

        const currentSettings = tuneSettingsRef.current
        const nextSettings = { ...currentSettings, [key]: nextValue }
        if (areTuneSettingsEqual(currentSettings, nextSettings)) return

        setTuneSettingsSynced(nextSettings)
        scheduleTuneSliderCommit()
    }, [beginTuneSliderInteraction, scheduleTuneSliderCommit, setTuneSettingsSynced])

    useEffect(() => {
        if (!isTuneMode) return

        const handleTuneUndoShortcut = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
            event.preventDefault()
            if (event.shiftKey) {
                redoTuneChange()
            } else {
                undoTuneChange()
            }
        }

        window.addEventListener('keydown', handleTuneUndoShortcut)
        return () => window.removeEventListener('keydown', handleTuneUndoShortcut)
    }, [isTuneMode, redoTuneChange, undoTuneChange])

    useEffect(() => {
        return () => clearTuneSliderCommitTimer()
    }, [clearTuneSliderCommitTimer])

    useEffect(() => {
        if (!isTuneMode || !page.illustration_url) {
            tuneSourceImageRef.current = null
            return
        }

        let cancelled = false
        const image = new Image()
        image.crossOrigin = 'anonymous'
        setIsTunePreviewLoading(true)
        setTunePreviewError(null)

        image.onload = () => {
            if (cancelled) return
            tuneSourceImageRef.current = image
            setTuneSourceVersion(version => version + 1)
            setIsTunePreviewLoading(false)
        }
        image.onerror = () => {
            if (cancelled) return
            tuneSourceImageRef.current = null
            setTunePreviewError('Preview image could not be loaded. Compare can still create the tuned image.')
            setIsTunePreviewLoading(false)
        }
        image.src = page.illustration_url

        return () => {
            cancelled = true
        }
    }, [isTuneMode, page.illustration_url])

    useEffect(() => {
        if (!isTuneMode || !tuneCanvasRef.current || !tuneSourceImageRef.current) return

        const frameId = window.requestAnimationFrame(() => {
            try {
                drawTunedPreview(tuneCanvasRef.current!, tuneSourceImageRef.current!, tuneSettings)
                setTunePreviewError(null)
            } catch (error: unknown) {
                setTunePreviewError(getErrorMessage(error, 'Preview failed'))
            }
        })

        return () => window.cancelAnimationFrame(frameId)
    }, [isTuneMode, tuneSettings, tuneSourceVersion])

    useEffect(() => {
        if (!currentFullscreenImage || !canNavigateFullscreenImages) return

        const handleFullscreenNavigation = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault()
                showPreviousFullscreenImage()
            } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                showNextFullscreenImage()
            }
        }

        window.addEventListener('keydown', handleFullscreenNavigation)
        return () => window.removeEventListener('keydown', handleFullscreenNavigation)
    }, [canNavigateFullscreenImages, currentFullscreenImage, showNextFullscreenImage, showPreviousFullscreenImage])

    const handleCompareTune = useCallback(() => {
        if (!onAutoTune || !page.illustration_url) return
        commitTuneSliderInteraction()
        setIsTuneMode(false)
        onAutoTune(tuneSettingsRef.current)
    }, [commitTuneSliderInteraction, onAutoTune, page.illustration_url])

    const renderTuneControls = () => {
        const renderTuneSlider = (control: TuneControl) => {
            const limit = IMAGE_TUNE_LIMITS[control.key]
            const value = tuneSettings[control.key]

            return (
                <div key={control.key} className="grid grid-cols-[78px_minmax(0,1fr)_30px] items-center gap-x-2">
                    <Label htmlFor={`inline-tune-${control.key}-${page.id}`} className="truncate text-xs font-medium text-slate-700">
                        {control.label}
                    </Label>
                    <input
                        id={`inline-tune-${control.key}-${page.id}`}
                        type="range"
                        min={limit.min}
                        max={limit.max}
                        step={limit.step}
                        value={value}
                        onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture?.(event.pointerId)
                            beginTuneSliderInteraction(control.key)
                        }}
                        onPointerUp={(event) => {
                            event.currentTarget.releasePointerCapture?.(event.pointerId)
                            commitTuneSliderInteraction()
                        }}
                        onPointerCancel={commitTuneSliderInteraction}
                        onBlur={commitTuneSliderInteraction}
                        onChange={(event) => updateTuneSetting(control.key, Number(event.target.value))}
                        className="w-full min-w-0 accent-purple-600"
                        style={{ accentColor: TUNE_SLIDER_ACCENTS[control.key] }}
                    />
                    <span className="text-right text-xs font-medium text-slate-500">
                        {value > 0 ? `+${value}` : value}
                    </span>
                </div>
            )
        }

        const renderTuneGroup = (group: typeof TUNE_CONTROL_GROUPS[number]) => {
            const isOpen = openTuneGroups[group.id]
            const activeCount = group.controls.filter(control => tuneSettings[control.key] !== DEFAULT_IMAGE_TUNE_SETTINGS[control.key]).length

            return (
                <section key={group.id} className="rounded-lg border border-slate-200 bg-white">
                    <button
                        type="button"
                        onClick={() => setOpenTuneGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                            <span className="truncate text-xs font-semibold uppercase tracking-wide text-slate-700">
                                {group.label}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TUNE_GROUP_ACTIVE_CLASS[group.id]}`}>
                                {TUNE_GROUP_HELP_TEXT[group.id]}
                            </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-400">
                            {activeCount > 0 ? `${activeCount} changed` : `${group.controls.length}`}
                        </span>
                    </button>

                    {isOpen && (
                        <div className="space-y-4 border-t border-slate-100 px-3 py-3">
                            {group.controls.map(renderTuneSlider)}
                        </div>
                    )}
                </section>
            )
        }

        return (
            <div className="h-full w-full overflow-y-auto bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4 md:hidden">
                    <Button type="button" variant="outline" className="h-9 min-w-[92px] flex-1" onClick={resetTuneSettings}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset
                    </Button>
                    <Button
                        type="button"
                        className="h-9 min-w-[112px] flex-[1.15] bg-purple-600 text-white hover:bg-purple-700"
                        onClick={handleCompareTune}
                        disabled={isGenerating || !page.illustration_url}
                    >
                        <SlidersHorizontal className="w-4 h-4 mr-2" />
                        Compare
                    </Button>
                    <div className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            onClick={undoTuneChange}
                            disabled={tuneUndoCount === 0}
                            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-35"
                            title="Undo (Cmd/Ctrl+Z)"
                            aria-label="Undo last tune change"
                        >
                            <Undo2 className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={redoTuneChange}
                            disabled={tuneRedoCount === 0}
                            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-35"
                            title="Redo (Cmd/Ctrl+Shift+Z)"
                            aria-label="Redo last tune change"
                        >
                            <Redo2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="space-y-2.5">
                    {TUNE_CONTROL_GROUPS.map(renderTuneGroup)}
                </div>

                {tunePreviewError && (
                    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {tunePreviewError}
                    </div>
                )}

            </div>
        )
    }

    const renderTuneAdjustedCheckbox = () => (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
            <input
                type="checkbox"
                checked={tunePreviewView === 'adjusted'}
                onChange={(event) => setTunePreviewView(event.target.checked ? 'adjusted' : 'reference')}
                className="h-4 w-4 rounded border-slate-300 accent-purple-600"
                aria-label="Show adjusted preview"
            />
            Preview
        </label>
    )

    const renderTuneReferencePicker = () => {
        if (tuneReferenceOptions.length === 0) return null

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="flex h-8 max-w-[170px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        <span className="truncate">Page {selectedTuneReferencePage.page_number}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-[300px] w-64 overflow-y-auto" align="end">
                    {tuneReferenceOptions.map(option => {
                        const isSelected = selectedTuneReferencePage.id === option.id

                        return (
                            <DropdownMenuItem
                                key={option.id}
                                onClick={() => setTuneReferencePageId(option.id === page.id ? null : option.id)}
                                className="flex cursor-pointer items-center gap-3"
                            >
                                <img
                                    src={option.illustration_url!}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="h-10 w-10 shrink-0 rounded bg-slate-100 object-cover"
                                />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                    Page {option.page_number}{option.id === page.id ? ' (current)' : ''}
                                </span>
                                {isSelected && <Check className="h-4 w-4 shrink-0 text-purple-600" />}
                            </DropdownMenuItem>
                        )
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }

    const handleTunePreviewClick = useCallback(() => {
        if (tunePreviewView === 'reference') {
            if (tuneReferenceUrl) {
                openFullscreenImage([{ url: tuneReferenceUrl, label: `Page ${selectedTuneReferencePage.page_number} Reference` }])
            }
            return
        }

        const canvas = tuneCanvasRef.current
        if (canvas && canvas.width > 0 && canvas.height > 0) {
            try {
                openFullscreenImage([{ url: canvas.toDataURL('image/jpeg', 0.92), label: 'Preview' }])
                return
            } catch {
                // Fall back to the source image when the canvas cannot export.
            }
        }
        if (page.illustration_url) openFullscreenImage([{ url: page.illustration_url, label: 'Preview' }])
    }, [openFullscreenImage, page.illustration_url, selectedTuneReferencePage.page_number, tunePreviewView, tuneReferenceUrl])

    const renderTunePreview = () => (
        <div
            className="relative w-full cursor-pointer bg-slate-50"
            onClick={handleTunePreviewClick}
        >
            <div
                className="absolute left-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur md:hidden"
                onClick={(event) => event.stopPropagation()}
            >
                {renderTuneAdjustedCheckbox()}
            </div>

            {tunePreviewView === 'reference' && (
                <div
                    className="absolute left-3 top-14 z-20 md:hidden"
                    onClick={(event) => event.stopPropagation()}
                >
                    {renderTuneReferencePicker()}
                </div>
            )}

            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation()
                    setIsTuneMode(false)
                }}
                disabled={isGenerating}
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="Cancel adjustment"
                aria-label="Cancel adjustment"
            >
                <X className="h-4 w-4" />
            </button>

            {isTunePreviewLoading && tunePreviewView === 'adjusted' && (
                <div className="absolute right-14 top-3 z-20 rounded-full bg-white/90 p-2 text-purple-600 shadow-sm ring-1 ring-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                </div>
            )}

            {page.illustration_url ? (
                <>
                    {tunePreviewError ? (
                        <img
                            src={page.illustration_url}
                            alt="Tuned Preview"
                            loading={feedImageLoading}
                            decoding="async"
                            className={`${tunePreviewView === 'adjusted' ? 'block' : 'hidden'} h-auto w-full object-contain`}
                            style={{ filter: tunePreviewFilter }}
                        />
                    ) : (
                        <canvas
                            ref={tuneCanvasRef}
                            aria-label="Tuned Preview"
                            className={`${tunePreviewView === 'adjusted' ? 'block' : 'hidden'} h-auto w-full object-contain`}
                        />
                    )}

                    {tuneReferenceUrl && (
                        <img
                            src={tuneReferenceUrl}
                            alt={`Page ${selectedTuneReferencePage.page_number} Reference`}
                            loading={feedImageLoading}
                            decoding="async"
                            className={`${tunePreviewView === 'reference' ? 'block' : 'hidden'} h-auto w-full object-contain`}
                        />
                    )}
                </>
            ) : (
                <div className="flex min-h-[300px] items-center justify-center">
                    <span className="text-sm text-slate-300">No illustration available</span>
                </div>
            )}
        </div>
    )

    useEffect(() => {
        return () => {
            if (remasterUpload) URL.revokeObjectURL(remasterUpload.preview)
        }
    }, [remasterUpload])

    const handleRemasterReferenceFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) {
            return
        }

        if (file.size > 10 * 1024 * 1024) {
            return
        }

        setRemasterUpload({ file, preview: URL.createObjectURL(file) })
        setRemasterReferencePageId(null)
    }, [])

    const handleRemasterReferenceSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) handleRemasterReferenceFile(file)
        event.target.value = ''
    }, [handleRemasterReferenceFile])

    const handleRemasterReferenceDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
        event.preventDefault()
        const file = event.dataTransfer.files?.[0]
        if (file) handleRemasterReferenceFile(file)
    }, [handleRemasterReferenceFile])

    const handleRemasterSubmit = useCallback(async () => {
        if (!onRegenerate || !page.illustration_url) return

        let qualityReferenceImages: string[] | undefined
        let referenceImageUrl: string | undefined

        if (selectedRemasterReferencePage?.illustration_url) {
            referenceImageUrl = selectedRemasterReferencePage?.illustration_url || undefined
        }

        if (remasterUpload) {
            try {
                qualityReferenceImages = [await readFileAsDataUrl(remasterUpload.file)]
            } catch (error) {
                console.error('Failed to read remaster quality reference:', error)
                return
            }
        }

        const resolvedModelId = remasterModel === 'nb-pro'
            ? 'gemini-3-pro-image-preview'
            : remasterModel === 'gpt-2'
                ? 'gpt-image-2'
                : undefined

        setIsRemasterDialogOpen(false)
        resetRemasterOptions()
        onRegenerate(remasterPrompt.trim() || REFRESH_PROMPT, qualityReferenceImages, referenceImageUrl, undefined, false, resolvedModelId, true)
    }, [
        onRegenerate,
        page.illustration_url,
        remasterModel,
        remasterPrompt,
        remasterUpload,
        resetRemasterOptions,
        selectedRemasterReferencePage?.illustration_url,
    ])

    const handleSketchToggleClick = useCallback((newMode: 'sketch' | 'text') => {
        if (!isAdmin || !onToggleAllSketchView) {
            setSketchViewMode(newMode)
            return
        }
        pendingSketchModeRef.current = newMode
        setSketchTogglePopoverOpen(true)
    }, [isAdmin, onToggleAllSketchView])

    const handleSketchToggleChoice = useCallback((scope: 'this' | 'all') => {
        const m = pendingSketchModeRef.current
        if (scope === 'all' && onToggleAllSketchView) {
            onToggleAllSketchView(m)
        } else {
            setSketchViewMode(m)
        }
        setSketchTogglePopoverOpen(false)
    }, [onToggleAllSketchView])

    // Centralized lock logic from useIllustrationLock hook
    const { isCustomerLocked } = useIllustrationLock({
        projectStatus,
        mode,
    })
    const isColoredReviewOpen = showColoredToCustomer && projectStatus === 'illustration_approved'
    const isLocked = isCustomerLocked && !isColoredReviewOpen
    const resolvedApprovalStage = approvalStage || (page.illustration_approved_at ? 'illustration' : 'sketch')
    const isPageApproved = resolvedApprovalStage === 'illustration' ? !!page.illustration_approved_at : !!page.sketch_approved_at
    const reviewAdminImageUrl = resolvedApprovalStage === 'illustration' ? page.illustration_url : page.sketch_url
    const reviewCustomerImageUrl = resolvedApprovalStage === 'illustration' ? page.customer_illustration_url : page.customer_sketch_url
    const hasUnsentCustomerImageUpdate = isCustomer && !!page.feedback_notes && !isPageApproved && !!reviewAdminImageUrl && reviewAdminImageUrl !== reviewCustomerImageUrl
    const customerVisibleIsResolved = isCustomer ? (!!page.is_resolved && !hasUnsentCustomerImageUpdate) : !!page.is_resolved
    const approvalPlural = resolvedApprovalStage === 'illustration' ? 'illustrations' : 'sketches'
    const approvalTitle = resolvedApprovalStage === 'illustration' ? 'Illustration approval' : 'Sketch approval'
    
    // Check if we're in Scene Recreation mode (dropdown selected)
    const isSceneRecreationMode = selectedEnvPageId !== null
    
    // Get character actions from the page for initializing scene characters
    const pageCharacterActions = useMemo(() => {
        return (page.character_actions || {}) as Record<string, { action?: string; pose?: string; emotion?: string }>
    }, [page.character_actions])
    
    // Initialize scene characters when dialog opens in Scene Recreation mode
    useEffect(() => {
        if (isRegenerateDialogOpen && isSceneRecreationMode && characters.length > 0) {
            const pageCharIds = new Set(page.character_ids || [])
            
            const initialSceneChars: SceneCharacter[] = characters.map(char => {
                const charName = char.name || char.role || 'Character'
                // Try exact name match first, then try partial/case-insensitive match
                const existingAction = pageCharacterActions[charName]
                    || Object.entries(pageCharacterActions).find(([key]) => 
                        key.toLowerCase().includes(charName.toLowerCase()) || 
                        charName.toLowerCase().includes(key.toLowerCase())
                    )?.[1]
                
                // Use character_ids (reliable, ID-based) for toggle, name match for action/emotion
                const isInScene = pageCharIds.has(char.id) || !!existingAction
                
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
    }, [isRegenerateDialogOpen, isSceneRecreationMode, characters, pageCharacterActions, page.character_ids])
    
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
            
            if (error) throw error        } catch (error: unknown) {            console.error(error)
        } finally {
            setIsSavingSceneNotes(false)
        }
    }, [projectId, page.id, editedSceneNotes])

    const handleApprovePageClick = async () => {
        if (!onApprovePage) return
        setIsApprovingPage(true)
        try {
            await onApprovePage()
            setShowApprovalDialog(false)
        } finally {
            setIsApprovingPage(false)
        }
    }

    // --------------------------------------------------------------------------
    // HANDLERS
    // --------------------------------------------------------------------------
    // Shared logic for adding reference image files (used by file input, drag-drop, and paste)
    const addReferenceFiles = useCallback((files: File[]) => {
        const imageFiles = files.filter(f => f.type.startsWith('image/'))
        if (imageFiles.length === 0) return

        const validFiles = imageFiles.filter(file => {
            if (file.size > 10 * 1024 * 1024) {
                return false
            }
            return true
        })

        if (referenceImages.length + validFiles.length > 5) {
            return
        }

        const newrefs = validFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file)
        }))

        setReferenceImages(prev => [...prev, ...newrefs])
    }, [referenceImages.length])

    const handleReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return
        addReferenceFiles(Array.from(e.target.files))
        // Clear input value so same file can be selected again if needed
        if (e.target) e.target.value = ''
    }

    // Drag-and-drop handlers for reference images area
    const handleRefDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleRefDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer.files?.length) {
            addReferenceFiles(Array.from(e.dataTransfer.files))
        }
    }, [addReferenceFiles])

    // Clipboard paste handler for reference images (active when regen dialog is open)
    useEffect(() => {
        if (!isRegenerateDialogOpen) return

        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items
            if (!items) return

            const imageFiles: File[] = []
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile()
                    if (file) imageFiles.push(file)
                }
            }

            if (imageFiles.length > 0) {
                e.preventDefault()
                addReferenceFiles(imageFiles)            }
        }

        document.addEventListener('paste', handlePaste)
        return () => document.removeEventListener('paste', handlePaste)
    }, [isRegenerateDialogOpen, addReferenceFiles])

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

    // Line Art Generation Handler (Admin only)
    const handleGenerateLineArt = useCallback(async () => {
        if (!page.illustration_url) {
            return
        }

        setIsGeneratingLineArt(true)
        try {
            const response = await fetch('/api/line-art/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    illustrationUrl: page.illustration_url,
                    pageNumber: page.page_number,
                    projectId,
                })
            })

            if (!response.ok) {
                // Try to parse error as JSON, fallback to text
                let errorMessage = 'Failed to generate line art'
                try {
                    const errorData = await response.json()
                    errorMessage = errorData.error || errorMessage
                } catch {
                    // Response wasn't JSON, try text
                    try {
                        errorMessage = await response.text() || errorMessage
                    } catch {
                        // Ignore
                    }
                }

                console.error('Line art generation failed:', errorMessage)
                return
            }

            // Download the PNG directly
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `lineart ${page.page_number}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Line art generation error:', err)
        } finally {
            setIsGeneratingLineArt(false)
        }
    }, [page.illustration_url, page.page_number, projectId])

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
        } catch (e) {
            console.error(e)
        } finally {
            setIsSaving(false)
        }
    }, [onSaveFeedback, notes])

    // Handle Admin Reply Save
    const handleSaveAdminReply = useCallback(async () => {
        if (!onSaveAdminReply || !adminReplyText.trim()) {
            setIsAdminReplying(false)
            return
        }
        setIsSavingAdminReply(true)
        try {
            await onSaveAdminReply(adminReplyText.trim())
            setAdminReplyText('')
            setIsAdminReplying(false)        } catch (e) {
            console.error(e)        } finally {
            setIsSavingAdminReply(false)
        }
    }, [onSaveAdminReply, adminReplyText])

    // Handle Customer Accept Admin Reply
    const handleAcceptReply = useCallback(async () => {
        if (!onAcceptAdminReply) return
        setIsAccepting(true)
        try {
            await onAcceptAdminReply()        } catch (e) {
            console.error(e)        } finally {
            setIsAccepting(false)
        }
    }, [onAcceptAdminReply])

    // Handle Customer Follow-up
    const handleCustomerFollowUp = useCallback(async () => {
        if (!onCustomerFollowUp || !followUpText.trim()) {
            setIsCustomerFollowingUp(false)
            return
        }
        setIsSavingFollowUp(true)
        try {
            await onCustomerFollowUp(followUpText.trim())
            setFollowUpText('')
            setIsCustomerFollowingUp(false)        } catch (e) {
            console.error(e)        } finally {
            setIsSavingFollowUp(false)
        }
    }, [onCustomerFollowUp, followUpText])

    // Handle Edit Admin Reply
    const handleEditAdminReply = useCallback(async () => {
        if (!onEditAdminReply || !adminReplyText.trim()) {
            setIsEditingAdminReply(false)
            return
        }
        setIsSavingAdminReply(true)
        try {
            await onEditAdminReply(adminReplyText.trim())
            setIsEditingAdminReply(false)        } catch (e) {
            console.error(e)        } finally {
            setIsSavingAdminReply(false)
        }
    }, [onEditAdminReply, adminReplyText])

    // Handle Edit Customer Follow-up
    const handleEditFollowUp = useCallback(async () => {
        if (!onEditFollowUp || !followUpText.trim()) {
            setIsEditingFollowUp(false)
            return
        }
        setIsSavingFollowUp(true)
        try {
            await onEditFollowUp(followUpText.trim())
            setIsEditingFollowUp(false)        } catch (e) {
            console.error(e)        } finally {
            setIsSavingFollowUp(false)
        }
    }, [onEditFollowUp, followUpText])

    // Handle Add Admin Comment (on resolved revision)
    const handleAddComment = useCallback(async () => {
        if (!onAddComment || !adminReplyText.trim()) {
            setIsAddingComment(false)
            return
        }
        setIsSavingAdminReply(true)
        try {
            await onAddComment(adminReplyText.trim())
            setAdminReplyText('')
            setIsAddingComment(false)        } catch (e) {
            console.error(e)        } finally {
            setIsSavingAdminReply(false)
        }
    }, [onAddComment, adminReplyText])

    // Handle Remove Admin Comment
    const handleRemoveComment = useCallback(async () => {
        if (!onRemoveComment) return
        setIsDeletingComment(true)
        try {
            await onRemoveComment()        } catch (e) {
            console.error(e)        } finally {
            setIsDeletingComment(false)
        }
    }, [onRemoveComment])

    // Handle Manual Resolve (Admin)
    const handleManualResolve = useCallback(async () => {
        if (!onManualResolve) return
        setIsResolving(true)
        try {
            await onManualResolve()
            setShowResolveDialog(false)        } catch (e) {
            console.error(e)        } finally {
            setIsResolving(false)
        }
    }, [onManualResolve])

    const handleAdminUploadSelect = useCallback((type: 'sketch' | 'illustration') => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && onUpload) {
            onUpload(type, e.target.files[0])
        }
        // Reset input so same file can be selected again
        e.target.value = ''
    }, [onUpload])

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
                illustrationType={illustrationType}
                setIllustrationType={setIllustrationType}
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
                illustrationType={illustrationType}
                setIllustrationType={setIllustrationType}
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
    const feedImageLoading = page.page_number === 1 ? 'eager' : 'lazy'
    const remasterSubmitDisabled = Boolean(
        isGenerating ||
        !page.illustration_url
    )

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
                        {/* ADMIN ONLY: DELETE + LAYOUT + REGEN BUTTONS */}
                        {isAdmin && onRegenerate ? (
                            <>
                                {/* Left group: Layout */}
                                <div className="flex items-center gap-1">
                                    {/* Layout Button */}
                                    {onLayoutChange && page.illustration_url ? (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={handleOpenLayoutDialog} 
                                            disabled={isGenerating}
                                            title="Change Layout"
                                            className="text-slate-500 hover:text-slate-700 px-2"
                                        >
                                            <Layers className="w-4 h-4 mr-1.5" />
                                            Layout
                                        </Button>
                                    ) : null}
                                </div>
                                {/* Regenerate Split Button: main click = full modal; caret = Refresh Quality */}
                                <div ref={regenerateSplitRef} className="flex">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleOpenRegenerateDialog}
                                        disabled={isGenerating}
                                        title="Regenerate with Instructions"
                                        className="rounded-r-none border-r-0"
                                    >
                                        Regenerate
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isGenerating || !page.illustration_url}
                                                className="rounded-l-none px-2"
                                                title="More options"
                                            >
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="end"
                                            style={regenerateSplitWidth ? { width: regenerateSplitWidth } : undefined}
                                        >
                                            <DropdownMenuItem onClick={handleOpenRemasterDialog} className="cursor-pointer">
                                                <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                                                Remaster
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </>
                        ) : <div />}
                    </div>

                    <div className="p-4 space-y-4 overflow-y-auto max-h-[800px] flex-1">
                        {/* ERROR DISPLAY - Show generation/regeneration errors */}
                        {generationError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                    <div className="flex-1">
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
                            </div>
                        )}

                        {isCustomer && (
                            <div className="text-sm text-slate-600 mb-4 leading-relaxed">
                                <p>Request revisions here.</p>
                            </div>
                        )}

                        {/* FEEDBACK SECTION */}
                        <div className="mt-2 space-y-3" ref={feedbackSectionRef}>
                            {/* READ ONLY FEEDBACK (Customer's Original Request) */}
                            {!isEditing && !isCustomerFollowingUp && page.feedback_notes && (
                                <div className={`${customerVisibleIsResolved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-100'} border rounded-md p-3 text-sm relative group animate-in fade-in zoom-in-95 duration-200`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <p className={`font-semibold text-xs uppercase ${customerVisibleIsResolved ? 'text-green-700' : 'text-amber-700'}`}>
                                                {customerVisibleIsResolved ? 'Resolved:' : 'Your Request:'}
                                            </p>
                                            {/* Admin Resolve Button - only for unresolved feedback */}
                                            {isAdmin && !page.is_resolved && onManualResolve && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 px-1.5 text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                                    onClick={() => setShowResolveDialog(true)}
                                                >
                                                    Resolve
                                                </Button>
                                            )}
                                        </div>
                                        {customerVisibleIsResolved && (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                RESOLVED
                                            </span>
                                        )}
                                    </div>
                                    <p className={`whitespace-pre-wrap ${customerVisibleIsResolved ? 'text-green-900' : 'text-amber-900'}`}>{page.feedback_notes}</p>
                                    {/* Customer Edit Button - only if no admin reply yet and no conversation started */}
                                    {isCustomer && !customerVisibleIsResolved && !isLocked && !page.admin_reply && (!page.conversation_thread || page.conversation_thread.length === 0) && (
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
                            
                            {/* ADMIN COMMENT ON RESOLVED (Illustrator Note - informational only) */}
                            {page.is_resolved && page.admin_reply && page.admin_reply_type === 'comment' && (
                                <div className="ml-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm relative group">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                                            <p className="font-semibold text-xs uppercase text-blue-700">Illustrator Note:</p>
                                        </div>
                                        <p className="whitespace-pre-wrap text-blue-900">{page.admin_reply}</p>
                                        
                                        {/* Admin Remove Button */}
                                        {isAdmin && onRemoveComment && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="absolute top-1 right-1 h-6 px-2 text-red-600 hover:text-red-800 hover:bg-red-100 transition-colors text-xs"
                                                onClick={handleRemoveComment}
                                                disabled={isDeletingComment}
                                            >
                                                {isDeletingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Remove'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            {/* ADD COMMENT BUTTON (Admin only, for resolved revisions without comment) */}
                            {isAdmin && page.is_resolved && !page.admin_reply && !isAddingComment && onAddComment && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsAddingComment(true)}
                                    className="w-full h-9 gap-2 text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-400 bg-white font-medium"
                                >
                                    <MessageSquarePlus className="w-4 h-4" />
                                    Add Comment
                                </Button>
                            )}
                            
                            {/* ADD COMMENT INPUT MODE (Admin only) */}
                            {isAdmin && isAddingComment && (
                                <div className="ml-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-3 bg-white rounded-lg p-3 border border-blue-200 shadow-sm ring-1 ring-blue-50">
                                        <div className="flex items-center gap-1.5">
                                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                                            <Label className="text-xs font-semibold text-blue-700 uppercase">Illustrator Note:</Label>
                                        </div>
                                        <Textarea
                                            value={adminReplyText}
                                            onChange={(e) => setAdminReplyText(e.target.value)}
                                            placeholder="Add a note for the customer..."
                                            className="min-h-[100px] text-sm resize-none focus-visible:ring-blue-500 border-blue-200 bg-white"
                                            autoFocus
                                        />
                                        <div className="flex gap-3 justify-end mt-2">
                                            <Button variant="ghost" size="sm" onClick={() => { setAdminReplyText(''); setIsAddingComment(false) }} className="text-slate-600 hover:bg-slate-50">Cancel</Button>
                                            <Button
                                                size="sm"
                                                onClick={handleAddComment}
                                                disabled={isSavingAdminReply || !adminReplyText.trim()}
                                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                            >
                                                {isSavingAdminReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                                Add Comment
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CONVERSATION THREAD (collapsible history of back-and-forth) */}
                            {page.conversation_thread && page.conversation_thread.length > 0 && !isCustomerFollowingUp && !isEditingFollowUp && (
                                <div className="ml-4">
                                    {/* Collapse/Expand Toggle */}
                                    <button
                                        onClick={() => setConversationExpanded(!conversationExpanded)}
                                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2 transition-colors"
                                    >
                                        {conversationExpanded ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                        {conversationExpanded ? 'Hide' : 'View'} {page.conversation_thread.length} previous {page.conversation_thread.length === 1 ? 'message' : 'messages'}
                                    </button>
                                    
                                    {/* Expanded Conversation History */}
                                    {conversationExpanded && (
                                        <div className="space-y-2 mb-3 pl-2 border-l-2 border-gray-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {page.conversation_thread.map((msg, idx) => {
                                                const isLastMessage = idx === page.conversation_thread!.length - 1
                                                const canEdit = isCustomer && isLastMessage && msg.type === 'customer' && !page.admin_reply && onEditFollowUp
                                                
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        className={`p-2 rounded text-xs relative group ${
                                                            msg.type === 'admin' 
                                                                ? 'bg-blue-50 border border-blue-100 ml-4' 
                                                                : 'bg-amber-50 border border-amber-100'
                                                        }`}
                                                    >
                                                        <p className={`font-semibold text-[10px] uppercase mb-0.5 ${
                                                            msg.type === 'admin' ? 'text-blue-600' : 'text-amber-600'
                                                        }`}>
                                                            {msg.type === 'admin' ? 'Illustrator:' : 'You:'}
                                                        </p>
                                                        <p className={`whitespace-pre-wrap ${
                                                            msg.type === 'admin' ? 'text-blue-800' : 'text-amber-800'
                                                        }`}>{msg.text}</p>
                                                        
                                                        {/* Customer Edit Button for their last follow-up */}
                                                        {canEdit && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="absolute top-1 right-1 h-5 px-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-colors text-[10px]"
                                                                onClick={() => { setFollowUpText(msg.text); setIsEditingFollowUp(true) }}
                                                            >
                                                                Edit
                                                            </Button>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* CUSTOMER EDIT FOLLOW-UP MODE */}
                            {isCustomer && isEditingFollowUp && (
                                <div className="ml-4 space-y-3 animate-in fade-in zoom-in-95 duration-200 bg-white rounded-lg p-3 border border-amber-100 shadow-sm ring-1 ring-amber-50">
                                    <Label className="text-xs font-semibold text-amber-800 uppercase">Edit Your Reply:</Label>
                                    <Textarea
                                        value={followUpText}
                                        onChange={(e) => setFollowUpText(e.target.value)}
                                        placeholder="Update your response..."
                                        className="min-h-[100px] text-sm resize-none focus-visible:ring-amber-500 border-amber-200 bg-white"
                                        autoFocus
                                    />
                                    <div className="flex gap-3 justify-end mt-2">
                                        <Button variant="ghost" size="sm" onClick={() => { setFollowUpText(''); setIsEditingFollowUp(false) }} className="text-slate-600 hover:bg-slate-50">Cancel</Button>
                                        <Button
                                            size="sm"
                                            onClick={handleEditFollowUp}
                                            disabled={isSavingFollowUp || !followUpText.trim()}
                                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                                            style={{ backgroundColor: '#d97706', color: '#ffffff' }}
                                        >
                                            {isSavingFollowUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                            Save Changes
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* ADMIN REPLY DISPLAY (Illustrator Note) - Latest reply */}
                            {page.admin_reply && !page.is_resolved && !isCustomerFollowingUp && !isEditingAdminReply && (
                                <div className={`${page.conversation_thread && page.conversation_thread.length > 0 ? 'ml-4' : 'ml-6'} animate-in fade-in slide-in-from-top-2 duration-300`}>
                                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm relative group">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                                            <p className="font-semibold text-xs uppercase text-blue-700">Illustrator Note:</p>
                                        </div>
                                        <p className="whitespace-pre-wrap text-blue-900">{page.admin_reply}</p>
                                        
                                        {/* Admin Edit Button - only if customer hasn't followed up */}
                                        {isAdmin && onEditAdminReply && (!page.conversation_thread || page.conversation_thread.length === 0 || page.conversation_thread[page.conversation_thread.length - 1]?.type !== 'customer') && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="absolute top-1 right-1 h-6 px-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition-colors text-xs"
                                                onClick={() => { setAdminReplyText(page.admin_reply || ''); setIsEditingAdminReply(true) }}
                                            >
                                                Edit
                                            </Button>
                                        )}
                                        
                                        {/* Customer Actions: Accept or Reply */}
                                        {isCustomer && !isLocked && (
                                            <div className="flex gap-3 mt-3">
                                                <Button
                                                    size="sm"
                                                    onClick={handleAcceptReply}
                                                    disabled={isAccepting}
                                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                                                >
                                                    {isAccepting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                                    Accept
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => setIsCustomerFollowingUp(true)}
                                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                                                >
                                                    <MessageSquarePlus className="w-4 h-4 mr-1.5" />
                                                    Reply
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            {/* ADMIN EDIT REPLY MODE */}
                            {isAdmin && isEditingAdminReply && (
                                <div className="ml-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-3 bg-white rounded-lg p-3 border border-blue-200 shadow-sm ring-1 ring-blue-50">
                                        <div className="flex items-center gap-1.5">
                                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                                            <Label className="text-xs font-semibold text-blue-700 uppercase">Edit Illustrator Note:</Label>
                                        </div>
                                        <Textarea
                                            value={adminReplyText}
                                            onChange={(e) => setAdminReplyText(e.target.value)}
                                            placeholder="Update your note..."
                                            className="min-h-[100px] text-sm resize-none focus-visible:ring-blue-500 border-blue-200 bg-white"
                                            autoFocus
                                        />
                                        <div className="flex gap-3 justify-end mt-2">
                                            <Button variant="ghost" size="sm" onClick={() => { setAdminReplyText(''); setIsEditingAdminReply(false) }} className="text-slate-600 hover:bg-slate-50">Cancel</Button>
                                            <Button
                                                size="sm"
                                                onClick={handleEditAdminReply}
                                                disabled={isSavingAdminReply || !adminReplyText.trim()}
                                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                            >
                                                {isSavingAdminReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                                Save Changes
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CUSTOMER WAITING FOR RESPONSE (conversation thread exists but no admin reply yet) */}
                            {isCustomer && !page.admin_reply && !customerVisibleIsResolved && page.conversation_thread && page.conversation_thread.length > 0 && !isCustomerFollowingUp && (
                                <div className="ml-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-600 italic">
                                    Awaiting illustrator response...
                                </div>
                            )}

                            {/* ADMIN REPLY BUTTON (Admin sees this when there's unresolved feedback) */}
                            {isAdmin && page.feedback_notes && !page.is_resolved && !page.admin_reply && !isAdminReplying && onSaveAdminReply && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsAdminReplying(true)}
                                    className="w-full h-9 gap-2 text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-400 bg-white font-medium"
                                >
                                    <MessageSquarePlus className="w-4 h-4" />
                                    {page.conversation_thread && page.conversation_thread.length > 0 ? 'Reply to Follow-up' : 'Reply to Customer'}
                                </Button>
                            )}

                            {/* ADMIN REPLY EDIT MODE - aligned right */}
                            {isAdmin && isAdminReplying && (
                                <div className="ml-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-3 bg-white rounded-lg p-3 border border-blue-200 shadow-sm ring-1 ring-blue-50">
                                        <div className="flex items-center gap-1.5">
                                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                                            <Label className="text-xs font-semibold text-blue-700 uppercase">Illustrator Note:</Label>
                                        </div>
                                        <Textarea
                                            value={adminReplyText}
                                            onChange={(e) => setAdminReplyText(e.target.value)}
                                            placeholder="Explain why you cannot make this change..."
                                            className="min-h-[100px] text-sm resize-none focus-visible:ring-blue-500 border-blue-200 bg-white"
                                            autoFocus
                                        />
                                        <div className="flex gap-3 justify-end mt-2">
                                            <Button variant="ghost" size="sm" onClick={() => { setAdminReplyText(''); setIsAdminReplying(false) }} className="text-slate-600 hover:bg-slate-50">Cancel</Button>
                                            <Button
                                                size="sm"
                                                onClick={handleSaveAdminReply}
                                                disabled={isSavingAdminReply || !adminReplyText.trim()}
                                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                            >
                                                {isSavingAdminReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                                Send Reply
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CUSTOMER FOLLOW-UP EDIT MODE */}
                            {isCustomer && isCustomerFollowingUp && (
                                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200 bg-white rounded-lg p-3 border border-amber-100 shadow-sm ring-1 ring-amber-50">
                                    <Label className="text-xs font-semibold text-amber-800 uppercase">Your Reply:</Label>
                                    <Textarea
                                        value={followUpText}
                                        onChange={(e) => setFollowUpText(e.target.value)}
                                        placeholder="Add your response or request..."
                                        className="min-h-[100px] text-sm resize-none focus-visible:ring-amber-500 border-amber-200 bg-white"
                                        autoFocus
                                    />
                                    <div className="flex gap-3 justify-end mt-2">
                                        <Button variant="ghost" size="sm" onClick={() => { setFollowUpText(''); setIsCustomerFollowingUp(false) }} className="text-slate-600 hover:bg-slate-50">Cancel</Button>
                                        <Button
                                            size="sm"
                                            onClick={handleCustomerFollowUp}
                                            disabled={isSavingFollowUp || !followUpText.trim()}
                                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                                            style={{ backgroundColor: '#d97706', color: '#ffffff' }}
                                        >
                                            {isSavingFollowUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                                            Send Reply
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* EDIT MODE (Customer Only - initial feedback) */}
                            {isEditing && isCustomer && (
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
                            )}
                        </div>

                        {/* HISTORY - Round-Based Collapsible */}
                        {page.feedback_history && page.feedback_history.length > 0 && (() => {
                            const hasCurrentFeedback = !!page.feedback_notes
                            
                            // Check if ANY item has a revision_round (new system)
                            const hasAnyRounds = page.feedback_history.some((item) => item.revision_round != null)
                            
                            // Badge component: shows round number if available, checkmark for legacy
                            const RevisionBadge = ({ round }: { round?: number }) => (
                                round != null ? (
                                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                        {round}
                                    </span>
                                ) : (
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                )
                            )
                            
                            let itemsOutside: FeedbackHistoryItem[] = []
                            let itemsToCollapse: FeedbackHistoryItem[] = []
                            
                            if (!hasAnyRounds) {
                                // LEGACY MODE: No rounds tracked yet - use old logic (latest by array order)
                                const reversedHistory = page.feedback_history.slice().reverse()
                                if (!hasCurrentFeedback) {
                                    itemsOutside = [reversedHistory[0]]
                                    itemsToCollapse = reversedHistory.slice(1)
                                } else {
                                    itemsToCollapse = reversedHistory
                                }
                            } else {
                                // ROUND-BASED MODE: Group by revision_round
                                // Current round items show outside, older rounds go in dropdown
                                const currentRound = illustrationSendCount
                                
                                if (!hasCurrentFeedback) {
                                    itemsOutside = page.feedback_history.filter((item) => item.revision_round === currentRound)
                                    itemsToCollapse = page.feedback_history.filter((item) => item.revision_round !== currentRound)
                                } else {
                                    // Customer is writing feedback - collapse all history
                                    itemsToCollapse = page.feedback_history.slice()
                                }
                                
                                // Sort collapsed items by round (newest first)
                                itemsToCollapse.sort((a, b) => (b.revision_round || 0) - (a.revision_round || 0))
                            }
                            
                            return (
                                <div className="mt-3 space-y-2">
                                    {/* Current round items - show outside dropdown */}
                                    {itemsOutside.map((item, idx) => (
                                        <div key={`outside-${idx}`} className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm flex items-start gap-2">
                                            <RevisionBadge round={item.revision_round} />
                                            <p className="leading-relaxed text-green-900">
                                                <span className="font-bold text-green-700 uppercase text-xs mr-2">Resolved:</span>
                                                {item.note}
                                            </p>
                                        </div>
                                    ))}
                                    
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
                                                    {itemsToCollapse.map((item, i) => (
                                                        <div key={`hist-${i}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm flex items-start gap-2">
                                                            <RevisionBadge round={item.revision_round} />
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

                        {(isCustomer || isAdmin) && isPageApproved && (
                            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 flex items-center justify-center gap-2">
                                <Check className="w-4 h-4" />
                                {resolvedApprovalStage === 'illustration' ? 'Illustration approved 🎉' : 'Sketch approved 🎉'}
                            </div>
                        )}

                        {/* REQUEST REVISION + APPROVAL BUTTONS (Customer Only) */}
                        {!isEditing && isCustomer && !isPageApproved && (!page.feedback_notes || customerVisibleIsResolved) && !isLocked && !isCustomerFollowingUp && (
                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                <Button variant="outline" size="sm" className="w-full sm:flex-1 min-w-0 h-11 gap-2 text-amber-600 border-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-700 shadow-sm bg-white font-medium justify-center" onClick={() => { setNotes(''); setIsEditing(true) }}>
                                    <MessageSquarePlus className="w-4 h-4 shrink-0" />
                                    <span className="truncate">Request Revision</span>
                                </Button>
                                {onApprovePage && (
                                    <Button size="sm" className="w-full sm:w-[116px] shrink-0 h-11 gap-2 bg-green-600 hover:bg-green-700 text-white shadow-sm font-semibold" onClick={() => setShowApprovalDialog(true)}>
                                        <Check className="w-4 h-4 shrink-0" />
                                        Approve
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* RIGHT COLUMN: IMAGES                                        */}
                {/* ----------------------------------------------------------- */}
                <div className="flex-1 flex flex-col min-w-0 h-full">

                    {/* MOBILE TOP BAR (Vibrant Page Separator) */}
                    <div className="md:hidden w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md flex items-center gap-3 shrink-0 relative overflow-hidden z-20">
                        {/* Abstract Background Element (Subtle) */}
                        <div className="absolute top-0 right-16 w-64 h-full bg-white/5 skew-x-12"></div>

                        {/* Page Identity — page number */}
                        <span
                            className="text-white text-sm font-bold z-10 shrink-0 min-w-fit"
                            title={`Page ${page.page_number}`}
                        >
                            {isCustomer ? `Page ${page.page_number}` : page.page_number}
                        </span>

                        {isAdmin && onLayoutChange && page.illustration_url && (
                            <button
                                onClick={handleOpenLayoutDialog}
                                disabled={isGenerating}
                                title="Change Layout"
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors disabled:opacity-30 z-10 shrink-0"
                            >
                                <Layers className="w-3.5 h-3.5" />
                            </button>
                        )}

                        {isAdmin && onRegenerate && (
                            <div ref={regenerateSplitMobileRef} className="flex z-10 shrink-0 ml-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleOpenRegenerateDialog}
                                    disabled={isGenerating}
                                    title="Regenerate with Instructions"
                                    className="bg-white/20 hover:bg-white/30 text-white border-transparent font-medium h-8 px-3 rounded-l-full rounded-r-none transition-colors"
                                >
                                    Regenerate
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={isGenerating || !page.illustration_url}
                                            title="More options"
                                            className="bg-white/20 hover:bg-white/30 text-white border-transparent h-8 px-2 rounded-l-none rounded-r-full border-l border-white/20 transition-colors"
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        style={regenerateSplitMobileWidth ? { width: regenerateSplitMobileWidth } : undefined}
                                    >
                                        <DropdownMenuItem onClick={handleOpenRemasterDialog} className="cursor-pointer">
                                            <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                                            Remaster
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}

                        {/* Revisions / Request Revision + Approval */}
                        <div className="ml-auto flex items-center gap-2 z-10 shrink-0">
                            {isCustomer && isPageApproved ? (
                                <div className="h-8 px-3 rounded-full bg-green-100 text-green-700 border border-green-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm shrink-0 pointer-events-none">
                                    <Check className="w-3.5 h-3.5" />
                                    Approved
                                </div>
                            ) : (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setHistoryOpen(true)}
                                        className="bg-amber-500 hover:bg-amber-600 text-white border-transparent font-semibold px-3 h-8 rounded-full transition-colors shadow-sm shrink-0 text-xs sm:text-sm"
                                    >
                                        {isAdmin ? 'Revisions' : 'Request Revision'}
                                    </Button>
                                    {isCustomer && onApprovePage && !isLocked && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowApprovalDialog(true)}
                                            className="bg-green-600 hover:bg-green-700 text-white border-transparent font-semibold px-3 h-8 rounded-full transition-colors shadow-sm shrink-0 text-xs sm:text-sm"
                                        >
                                            <Check className="w-3.5 h-3.5 mr-1" />
                                            Approve
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>

                        {/* HISTORY DIALOG */}
                        <ReviewHistoryDialog
                            open={historyOpen}
                            onOpenChange={setHistoryOpen}
                            page={page}
                            canEdit={isCustomer && !isLocked}
                            onSave={handleCustomerSave}
                        />
                    </div>

                    {/* MOBILE ERROR DISPLAY - Show generation/regeneration errors */}
                    {generationError && (
                        <div className="md:hidden bg-red-50 border-b border-red-200 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-red-800">{generationError.message}</p>
                                    <button
                                        onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                                        className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                                    >
                                        <ChevronRight className={`w-3 h-3 transition-transform ${showTechnicalDetails ? 'rotate-90' : ''}`} />
                                        Details
                                    </button>
                                    {showTechnicalDetails && (
                                        <pre className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700 overflow-x-auto whitespace-pre-wrap max-h-32">
                                            {generationError.technicalDetails}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DESKTOP HEADER (73px) */}
                    <div className="hidden h-[73px] min-h-[73px] max-h-[73px] shrink-0 grid-cols-2 divide-x overflow-visible border-b border-slate-100 bg-white text-sm md:grid">

                        {/* SKETCH HEADER */}
                        <div className="grid h-full min-h-0 grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-2 overflow-visible px-3">
                            {/* LEFT: Tune undo/redo */}
                            <div className="flex items-center gap-2 min-w-[80px]">
                                {isTuneMode && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={undoTuneChange}
                                            disabled={tuneUndoCount === 0}
                                            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-35"
                                            title="Undo (Cmd/Ctrl+Z)"
                                            aria-label="Undo last tune change"
                                        >
                                            <Undo2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={redoTuneChange}
                                            disabled={tuneRedoCount === 0}
                                            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-35"
                                            title="Redo (Cmd/Ctrl+Shift+Z)"
                                            aria-label="Redo last tune change"
                                        >
                                            <Redo2 className="h-4 w-4" />
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* CENTER: Sketch/Story Toggle */}
	                            {isTuneMode ? (
                                <div aria-hidden="true" />
                            ) : (isAdmin || showColoredToCustomer) ? (
	                                <div className="relative justify-self-center" ref={sketchPopoverDesktopRef}>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleSketchToggleClick('sketch')}
                                            className={`text-xs font-bold tracking-wider uppercase transition-colors ${sketchViewMode === 'sketch' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600 cursor-pointer'}`}
                                        >
                                            Sketch
                                        </button>
                                        <Switch
                                            checked={sketchViewMode === 'text'}
                                            onCheckedChange={(checked) => handleSketchToggleClick(checked ? 'text' : 'sketch')}
                                            className="!bg-slate-300"
                                        />
                                        <button
                                            onClick={() => handleSketchToggleClick('text')}
                                            className={`text-xs font-bold tracking-wider uppercase transition-colors ${sketchViewMode === 'text' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600 cursor-pointer'}`}
                                        >
                                            Story
                                        </button>
                                    </div>
                                    {sketchTogglePopoverOpen && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-lg border shadow-md p-1 flex gap-1 animate-in fade-in zoom-in-95 duration-150">
                                            <button
                                                onClick={() => handleSketchToggleChoice('this')}
                                                className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
                                            >
                                                This page
                                            </button>
                                            <button
                                                onClick={() => handleSketchToggleChoice('all')}
                                                className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-purple-50 hover:text-purple-700 transition-colors whitespace-nowrap"
                                            >
                                                All pages
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                                    Sketch
                                </h4>
                            )}

                            {/* RIGHT: Buttons */}
                            <div className="flex items-center gap-2 min-w-[80px] justify-end">
                                {isTuneMode ? (
                                    <>
                                        <Button type="button" variant="outline" size="sm" className="h-8 px-3" onClick={resetTuneSettings}>
                                            <RotateCcw className="w-4 h-4 mr-2" />
                                            Reset
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="h-8 bg-purple-600 px-3 text-white hover:bg-purple-700"
                                            onClick={handleCompareTune}
                                            disabled={isGenerating || !page.illustration_url}
                                        >
                                            <SlidersHorizontal className="w-4 h-4 mr-2" />
                                            Compare
                                        </Button>
                                    </>
                                ) : (
                                    <>
	                                {isAdmin && onUpload && (
	                                    <div className={`transition-opacity ${sketchViewMode === 'text' ? 'opacity-0 pointer-events-none' : ''}`}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => sketchInputRef.current?.click()} title="Upload Sketch">
                                            <Upload className="w-4 h-4" />
                                        </Button>
                                        <input type="file" ref={sketchInputRef} className="hidden" accept="image/*" onChange={handleAdminUploadSelect('sketch')} />
                                    </div>
                                )}
	                                {sketchUrl && !isTuneMode && (
	                                    <button onClick={() => handleDownload(sketchUrl!, `Page-${page.page_number}-Sketch.jpg`)} className={`h-8 w-8 rounded-full bg-black/5 text-slate-500 hover:bg-black/10 hover:text-purple-600 transition-colors flex items-center justify-center ${sketchViewMode === 'text' ? 'opacity-0 pointer-events-none' : ''}`} title="Download Sketch">
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* ILLUSTRATION HEADER (or PAGE TEXT for customer pages 2+) */}
                        <div className="grid h-full min-h-0 grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-3 overflow-visible bg-slate-50/30 px-3">
                            {/* LEFT: Create LineArt + Create Cover Buttons (Admin only, when illustration exists) */}
                            <div className={`flex items-center gap-2 ${isTuneMode ? 'w-[180px]' : 'min-w-[80px]'}`}>
                                {!isTuneMode && isAdmin && illustrationUrl ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleGenerateLineArt}
                                            disabled={isGeneratingLineArt}
                                            className="h-7 px-2.5 text-[10px] font-semibold bg-white border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-800 transition-colors"
                                            title="Generate transparent line art PNG"
                                        >
                                            {isGeneratingLineArt ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                <>
                                                    <Pencil className="w-3 h-3 mr-1" />
                                                    Create LineArt
                                                </>
                                            )}
                                        </Button>
                                        {!hasCover && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setIsCoverModalOpen(true)}
                                                className="h-7 px-2.5 text-[10px] font-semibold bg-white border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-800 transition-colors"
                                                title="Generate a book cover using this illustration"
                                            >
                                                <BookImage className="w-3 h-3 mr-1" />
                                                Create Cover
                                            </Button>
                                        )}
                                    </>
                                ) : null}
                            </div>

                            {/* CENTER: Title */}
                            <div className="flex min-w-0 justify-center">
                                {isTuneMode ? (
                                    renderTuneAdjustedCheckbox()
                                ) : (
                                    <h4 className="truncate text-xs font-bold tracking-wider text-slate-900 uppercase">
	                                    {isCustomer && page.page_number > 1 && !showColoredToCustomer ? 'Page Text' : isAdmin ? 'Illustration' : 'Final Illustration'}
                                    </h4>
                                )}
                            </div>

                            {/* RIGHT: Buttons */}
                            <div className={`flex items-center justify-end gap-2 ${isTuneMode ? 'w-[180px]' : 'min-w-[80px]'}`}>
                                {isTuneMode ? (
                                    tunePreviewView === 'reference' ? renderTuneReferencePicker() : null
                                ) : (
                                    <>
                                        {isAdmin && onUpload && (
                                            <>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => illustrationInputRef.current?.click()} title="Upload Illustration">
                                                    <Upload className="w-4 h-4" />
                                                </Button>
                                                <input type="file" ref={illustrationInputRef} className="hidden" accept="image/*" onChange={handleAdminUploadSelect('illustration')} />
                                            </>
                                        )}
                                        {!(isCustomer && page.page_number > 1 && !showColoredToCustomer) && illustrationUrl && (
                                            <button onClick={() => handleDownload(illustrationUrl!, `Page-${page.page_number}-Illustration.jpg`)} className="h-8 w-8 rounded-full bg-black/5 text-slate-500 hover:bg-black/10 hover:text-purple-600 transition-colors flex items-center justify-center" title="Download Illustration">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* IMAGES GRID (The Core Layout) */}
                    {/* COMPARISON MODE: Show OLD vs NEW side by side */}
	                    {comparisonState && onComparisonDecision ? (
	                        comparisonState.isAutoTune ? (
	                            <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x divide-slate-100 h-full overflow-y-auto md:overflow-hidden">
	                                {/* NEW TUNED ILLUSTRATION (Left) */}
	                                <div className="flex flex-col items-center bg-slate-50/10 relative min-h-[300px] md:min-h-0">
	                                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
	                                        <span className="text-sm font-bold tracking-wider text-white uppercase px-3 py-1 bg-green-600/90 rounded">NEW</span>
	                                    </div>
		                                    <div className="relative w-full h-full cursor-pointer" onClick={() => openFullscreenImage([
		                                        { url: comparisonState.newUrl, label: 'New' },
		                                        { url: comparisonState.oldUrl, label: 'Old' },
		                                    ], 0)}>
		                                        <img
		                                            key={`auto-tune-new-${comparisonState.newUrl}`}
		                                            src={comparisonState.newUrl}
		                                            alt="Tuned Illustration"
		                                            loading={feedImageLoading}
		                                            decoding="async"
		                                            className="w-full h-full object-contain block"
	                                        />
	                                    </div>
	                                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
	                                        <div className="grid grid-cols-2 gap-2">
		                                            <Button
		                                                onClick={() => {
		                                                    setIsTuneMode(true)
		                                                    onComparisonDecision('keep_editing')
		                                                }}
	                                                variant="outline"
	                                                className="bg-white/90 hover:bg-white text-slate-800 border-slate-300 gap-2"
	                                            >
	                                                <Pencil className="w-4 h-4" />
	                                                Keep Editing
	                                            </Button>
	                                            <Button
	                                                onClick={() => onComparisonDecision('keep_new')}
	                                                className="bg-green-600 hover:bg-green-700 text-white gap-2"
	                                            >
	                                                <CheckCircle2 className="w-4 h-4 text-white" />
	                                                Keep New
	                                            </Button>
	                                        </div>
	                                    </div>
	                                </div>

	                                {/* OLD ILLUSTRATION (Right) */}
	                                <div className="flex flex-col items-center bg-white relative min-h-[300px] md:min-h-0">
	                                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
	                                        <span className="text-sm font-bold tracking-wider text-white uppercase px-3 py-1 bg-slate-700/80 rounded">OLD</span>
	                                    </div>
		                                    <div className="relative w-full h-full cursor-pointer" onClick={() => openFullscreenImage([
		                                        { url: comparisonState.newUrl, label: 'New' },
		                                        { url: comparisonState.oldUrl, label: 'Old' },
		                                    ], 1)}>
		                                        <img
		                                            key={`auto-tune-old-${comparisonState.oldUrl}`}
		                                            src={comparisonState.oldUrl}
		                                            alt="Previous Illustration"
		                                            loading={feedImageLoading}
		                                            decoding="async"
		                                            className="w-full h-full object-contain block"
	                                        />
	                                    </div>
	                                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
	                                        <Button
	                                            onClick={() => onComparisonDecision('revert_old')}
	                                            variant="outline"
	                                            className="w-full bg-white/90 hover:bg-white text-slate-800 border-slate-300"
	                                        >
	                                            Revert Old
	                                        </Button>
	                                    </div>
	                                </div>
	                            </div>
	                        ) : (
	                            <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x divide-slate-100 h-full overflow-y-auto md:overflow-hidden">
	                                {/* OLD ILLUSTRATION (Left) */}
	                                <div className="flex flex-col items-center bg-white relative min-h-[300px] md:min-h-0">
	                                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
	                                        <span className="text-sm font-bold tracking-wider text-white uppercase px-3 py-1 bg-slate-700/80 rounded">OLD</span>
	                                    </div>
		                                    <div className="relative w-full h-full cursor-pointer" onClick={() => openFullscreenImage([
		                                        { url: comparisonState.oldUrl, label: 'Old' },
		                                        { url: comparisonState.newUrl, label: 'New' },
		                                    ], 0)}>
		                                        <img
		                                            key={`comparison-old-${comparisonState.oldUrl}`}
		                                            src={comparisonState.oldUrl}
		                                            alt="Previous Illustration"
		                                            loading={feedImageLoading}
		                                            decoding="async"
		                                            className="w-full h-full object-contain block"
	                                        />
	                                    </div>
	                                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
	                                        <Button
	                                            onClick={() => onComparisonDecision('revert_old')}
	                                            variant="outline"
	                                            className="w-full bg-white/90 hover:bg-white text-slate-800 border-slate-300"
	                                        >
	                                            Revert Old
	                                        </Button>
	                                    </div>
	                                </div>

	                                {/* NEW ILLUSTRATION (Right) */}
	                                <div className="flex flex-col items-center bg-slate-50/10 relative min-h-[300px] md:min-h-0">
	                                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
	                                        <span className="text-sm font-bold tracking-wider text-white uppercase px-3 py-1 bg-green-600/90 rounded">NEW</span>
	                                    </div>
		                                    <div className="relative w-full h-full cursor-pointer" onClick={() => openFullscreenImage([
		                                        { url: comparisonState.oldUrl, label: 'Old' },
		                                        { url: comparisonState.newUrl, label: 'New' },
		                                    ], 1)}>
		                                        <img
		                                            key={`comparison-new-${comparisonState.newUrl}`}
		                                            src={comparisonState.newUrl}
		                                            alt="New Illustration"
		                                            loading={feedImageLoading}
		                                            decoding="async"
		                                            className="w-full h-full object-contain block"
	                                        />
	                                    </div>
	                                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
	                                        <Button
	                                            onClick={() => onComparisonDecision('keep_new')}
	                                            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
	                                        >
	                                            <CheckCircle2 className="w-4 h-4 text-white" />
	                                            Keep New
	                                        </Button>
	                                    </div>
	                                </div>
	                            </div>
	                        )
	                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 flex-1 divide-y md:divide-y-0 md:divide-x divide-slate-100 h-full overflow-y-auto md:overflow-hidden">

                        {/* 1. SKETCH BLOCK */}
                        <div className="flex flex-col items-center md:space-y-0 bg-white relative min-h-[300px] md:min-h-0">
                            {/* MOBILE HEADER FOR SKETCH (Overlay) */}
                            <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden pt-1.5 px-3 pb-3 bg-gradient-to-b from-black/40 to-transparent">

                                {/* Sketch/Story Toggle - Mobile: Show for admin, or customer when colored images enabled */}
                                {(isAdmin || showColoredToCustomer) ? (
                                    <div className="relative" ref={sketchPopoverMobileRef}>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleSketchToggleClick('sketch')}
                                                className={`text-xs font-bold tracking-wider uppercase transition-colors ${sketchViewMode === 'sketch' ? 'text-white' : 'text-white/50 active:text-white/70'}`}
                                            >
                                                Sketch
                                            </button>
                                            <Switch
                                                checked={sketchViewMode === 'text'}
                                                onCheckedChange={(checked) => handleSketchToggleClick(checked ? 'text' : 'sketch')}
                                                className="!bg-slate-400"
                                            />
                                            <button
                                                onClick={() => handleSketchToggleClick('text')}
                                                className={`text-xs font-bold tracking-wider uppercase transition-colors ${sketchViewMode === 'text' ? 'text-white' : 'text-white/50 active:text-white/70'}`}
                                            >
                                                Story
                                            </button>
                                        </div>
                                        {sketchTogglePopoverOpen && (
                                            <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-lg border shadow-md p-1 flex gap-1 animate-in fade-in zoom-in-95 duration-150">
                                                <button
                                                    onClick={() => handleSketchToggleChoice('this')}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap text-slate-700"
                                                >
                                                    This page
                                                </button>
                                                <button
                                                    onClick={() => handleSketchToggleChoice('all')}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-purple-50 hover:text-purple-700 transition-colors whitespace-nowrap text-slate-700"
                                                >
                                                    All pages
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs font-bold tracking-wider text-white/90 uppercase">
                                        Sketch
                                    </span>
                                )}

                                {/* UPLOAD (Admin) - Invisible in Text Mode to prevent layout shift */}
                                {isAdmin && onUpload && (
                                    <Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full bg-black/40 text-red-500 hover:bg-black/60 backdrop-blur-sm transition-opacity ml-auto ${sketchViewMode === 'text' ? 'opacity-0 pointer-events-none' : ''}`} onClick={() => sketchInputRef.current?.click()}>
                                        <Upload className="w-4 h-4" />
                                    </Button>
                                )}

                                {/* DOWNLOAD - Invisible in Text Mode to prevent layout shift */}
                                {sketchUrl && (
                                    <button onClick={() => handleDownload(sketchUrl!, `Page-${page.page_number}-Sketch.jpg`)} className={`h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-opacity ${(!isAdmin || !onUpload) ? 'ml-auto' : ''} ${sketchViewMode === 'text' ? 'opacity-0 pointer-events-none' : ''}`}>
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* MAIN CONTENT: IMAGE or TEXT */}
	                            {isTuneMode ? (
	                                renderTuneControls()
	                            ) : sketchViewMode === 'sketch' ? (
	                                <div className="relative w-full h-full cursor-pointer bg-white" onClick={() => sketchUrl && openFullscreenImage([{ url: sketchUrl, label: 'Sketch' }])}>
                                    {loadingState.sketch && <AnimatedOverlay label="Tracing Sketch..." />}
                                    {sketchUrl ? (
                                        <img
                                            src={sketchUrl}
                                            alt="Sketch"
                                            loading={feedImageLoading}
                                            decoding="async"
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
                                <div className="w-full p-8 bg-white text-slate-900 pointer-events-auto cursor-text text-left max-h-[60vh] md:max-h-none md:absolute md:inset-0 md:h-full flex flex-col">
                                    {/* 1. PAGE TEXT */}
                                    <div className="shrink-0">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">Page {page.page_number}</span>
                                        <p className="text-lg md:text-xl font-serif leading-relaxed text-slate-800 mb-6" style={{ whiteSpace: 'pre-wrap' }}>
                                            {stripHtml(page.story_text || '') || <span className="italic text-slate-300">No text content available.</span>}
                                        </p>
                                    </div>

                                    {/* 2. SCENE DESCRIPTION (Admin Only) — fills remaining space */}
                                    {isAdmin && (
                                        <div className="bg-amber-50/50 p-5 rounded-lg border border-amber-100/60 flex-1 flex flex-col min-h-0">
                                            <span className="flex items-center gap-2 text-[10px] font-bold text-amber-600/80 uppercase tracking-widest mb-2 shrink-0">
                                                🎨 Scene Description
                                            </span>
                                            <div className="flex-1 flex flex-col min-h-0 gap-3">
                                                <Textarea
                                                    value={editedSceneNotes}
                                                    onChange={(e) => setEditedSceneNotes(e.target.value)}
                                                    placeholder="Describe the scene for the illustrator..."
                                                    className="flex-1 min-h-[80px] text-sm resize-none bg-white border-amber-200 focus-visible:ring-amber-500"
                                                />
                                                {hasSceneNotesChanged && (
                                                    <div className="flex justify-end shrink-0">
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
                            )}
                        </div>



                        {/* 2. ILLUSTRATION BLOCK (or PAGE TEXT for customer pages 2+) */}
                        <div className="flex flex-col items-center md:space-y-0 bg-slate-50/10 relative min-h-[300px] md:min-h-0">
                            {/* MOBILE HEADER FOR ILLUSTRATION (Overlay) - Only for admin or customer page 1 (or all pages if showColoredToCustomer) */}
                            {!(isCustomer && page.page_number > 1 && !showColoredToCustomer) && (
                                <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden p-3 bg-gradient-to-b from-black/40 to-transparent">
	                                    <span className="text-xs font-bold tracking-wider text-white/90 uppercase shadow-sm">{isTuneMode ? 'Preview' : 'Colored'}</span>

                                    {/* CREATE COVER (Admin, when illustration exists & no cover yet) */}
	                                    {isAdmin && illustrationUrl && !hasCover && !isTuneMode && (
                                        <button
                                            onClick={() => setIsCoverModalOpen(true)}
                                            className="h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm ml-auto"
                                            title="Create Cover"
                                        >
                                            <BookImage className="w-4 h-4" />
                                        </button>
                                    )}

                                    {/* UPLOAD (Admin) */}
	                                    {isAdmin && onUpload && !isTuneMode && (
                                        <Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full bg-black/40 text-red-500 hover:bg-black/60 backdrop-blur-sm ${isAdmin && illustrationUrl && !hasCover ? 'ml-1' : 'ml-auto'}`} onClick={() => illustrationInputRef.current?.click()}>
                                            <Upload className="w-4 h-4" />
                                        </Button>
                                    )}

                                    {/* AUTO TUNE (Admin) */}
	                                    {isAdmin && illustrationUrl && onAutoTune && !isTuneMode && (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                handleOpenTuneMode()
                                            }}
                                            disabled={isGenerating || loadingState.illustration}
                                            className="h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm ml-1"
                                            title="Tune Image"
                                        >
                                            {loadingState.illustration ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                                        </button>
                                    )}

                                    {/* DOWNLOAD */}
	                                    {illustrationUrl && !isTuneMode && (
                                        <button onClick={() => handleDownload(illustrationUrl!, `Page-${page.page_number}-Final.jpg`)} className={`h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm ${(isAdmin && onUpload) || (isAdmin && illustrationUrl) ? 'ml-1' : 'ml-auto'}`}>
                                            <Download className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* MOBILE HEADER FOR PAGE TEXT (Customer pages 2+ when showColoredToCustomer is off) */}
                            {isCustomer && page.page_number > 1 && !showColoredToCustomer && (
                                <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 md:hidden p-3 bg-gradient-to-b from-black/40 to-transparent">
                                    <span className="text-xs font-bold tracking-wider text-white/90 uppercase shadow-sm">Page Text</span>
                                </div>
                            )}

                            {/* CONTENT: Page Text for customer pages 2+ (when showColoredToCustomer is off), Illustration otherwise */}
	                            {isTuneMode ? (
	                                renderTunePreview()
	                            ) : isCustomer && page.page_number > 1 && !showColoredToCustomer ? (
	                                /* PAGE TEXT VIEW for customer pages 2+ */
                                <div className="w-full h-full p-8 bg-white text-slate-900 overflow-y-auto">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">Page {page.page_number}</span>
                                    <p className="text-lg md:text-xl font-serif leading-relaxed text-slate-800" style={{ whiteSpace: 'pre-wrap' }}>
                                        {stripHtml(page.story_text || '') || <span className="italic text-slate-300">No text content available.</span>}
                                    </p>
                                </div>
                            ) : (
                                /* ILLUSTRATION VIEW for admin and customer page 1 */
	                                <div className="relative w-full cursor-pointer" onClick={() => illustrationUrl && openFullscreenImage([{ url: illustrationUrl, label: 'Illustration' }])}>
                                    {isAdmin && illustrationUrl && onAutoTune && (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                handleOpenTuneMode()
                                            }}
                                            disabled={isGenerating || loadingState.illustration}
                                            className="absolute right-3 top-3 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-white hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
                                            title="Tune Image"
                                        >
                                            {loadingState.illustration ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                                        </button>
                                    )}
                                    {/* Show overlay if specific granular loading is active OR if generating and we already have an image (regeneration case) */}
                                    {(loadingState.illustration || (isGenerating && illustrationUrl)) && (
                                        <AnimatedOverlay label="Painting Illustration..." />
                                    )}

                                    {illustrationUrl ? (
                                        <img
                                            src={illustrationUrl}
                                            alt="Final"
                                            loading={feedImageLoading}
                                            decoding="async"
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
                    )}
                </div>
            </div>

            {/* Lightbox */}
            <Dialog open={!!currentFullscreenImage} onOpenChange={(open) => !open && closeFullscreenImage()}>
                <DialogContent
                    showCloseButton={false}
                    className="!max-w-none !w-screen !h-screen !p-0 !m-0 !translate-x-0 !translate-y-0 !top-0 !left-0 bg-transparent border-none shadow-none flex items-center justify-center outline-none"
                    aria-describedby={undefined}
                >
                    <DialogTitle className="sr-only">{currentFullscreenImage?.label || 'Full Size View'}</DialogTitle>
                    <DialogDescription className="sr-only">Review the illustration in full detail</DialogDescription>

                    <div className="relative w-full h-full flex items-center justify-center p-4" onClick={closeFullscreenImage}>
                        {currentFullscreenImage && (
                            <img
                                src={currentFullscreenImage.url}
                                alt={currentFullscreenImage.label || 'Full view'}
                                className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                        {canNavigateFullscreenImages && currentFullscreenImage && (
                            <>
                                <button
                                    type="button"
                                    disabled={fullscreenImageIndex === 0}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-white/90 bg-black/50 hover:bg-black/70 rounded-full p-3 z-50 pointer-events-auto transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-black/50"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        showPreviousFullscreenImage()
                                    }}
                                    aria-label="View previous image"
                                >
                                    <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
                                </button>
                                <button
                                    type="button"
                                    disabled={fullscreenImageIndex >= fullscreenImages.length - 1}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-white/90 bg-black/50 hover:bg-black/70 rounded-full p-3 z-50 pointer-events-auto transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-black/50"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        showNextFullscreenImage()
                                    }}
                                    aria-label="View next image"
                                >
                                    <ChevronRight className="w-7 h-7" strokeWidth={2.5} />
                                </button>
                            </>
                        )}
                        {canNavigateFullscreenImages && currentFullscreenImage?.label && (
                            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-white">
                                {currentFullscreenImage.label}
                            </div>
                        )}
                        <button
                            className="absolute top-6 right-6 text-white hover:text-white/80 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-2 z-50 pointer-events-auto cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                closeFullscreenImage();
                            }}
                        >
                            <span className="sr-only">Close</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ADMIN MANUAL RESOLVE CONFIRMATION DIALOG */}
            <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Resolve Revision</DialogTitle>
                        <DialogDescription>
                            Resolve this revision without making changes?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setShowResolveDialog(false)}
                            disabled={isResolving}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleManualResolve}
                            disabled={isResolving}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {isResolving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                            Resolve
                        </Button>
                    </DialogFooter>
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
                        setPromptWasAutoPopulated(false)
                        setUseThinkingMode(false)
                        setIllustrationModel('nb2')
                    }
                }}>
                    <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-1.5">
                                <span>Regenerate with</span>
                                <Select value={illustrationModel} onValueChange={(v) => { setIllustrationModel(v as IllustrationModelId); if (v !== 'nb2') setUseThinkingMode(false) }}>
                                    <SelectTrigger className="w-[100px] h-7 text-sm font-semibold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="nb2">NB2</SelectItem>
                                        <SelectItem value="nb-pro">NB Pro</SelectItem>
                                        <SelectItem value="gpt-2">GPT 2</SelectItem>
                                    </SelectContent>
                                </Select>
                            </DialogTitle>
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
                                        <DropdownMenuContent className="w-[calc(550px-3rem)] max-h-[300px] overflow-y-auto" align="start">
                                            <DropdownMenuItem 
                                                onClick={() => handleEnvSelect(null)} 
                                                className="cursor-pointer"
                                            >
                                                <X className="w-4 h-4 mr-2 text-slate-400" />
                                                None (Edit Current Image)
                                            </DropdownMenuItem>
                                            {illustratedPages.map(prevPage => (
                                                <DropdownMenuItem
                                                    key={prevPage.id}
                                                    onClick={() => handleEnvSelect(prevPage.id)}
                                                    className="cursor-pointer flex items-center gap-2.5 py-2"
                                                >
                                                    {prevPage.illustration_url ? (
                                                        <img
                                                            src={prevPage.illustration_url}
                                                            alt={`Page ${prevPage.page_number}`}
                                                            loading="lazy"
                                                            decoding="async"
                                                            className="w-8 h-8 rounded object-cover border border-slate-200 flex-shrink-0"
                                                        />
                                                    ) : (
                                                        <Bookmark className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                                    )}
                                                    <span>Page {prevPage.page_number} Environment</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    {isSceneRecreationMode && (
                                        <p className="text-xs text-purple-600 bg-purple-50 p-2 rounded-md">
                                            Scene Recreation Mode: The selected page&apos;s background will be preserved.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* INSTRUCTIONS */}
                            <div className="space-y-2">
                                <Label>Instructions {isSceneRecreationMode && <span className="text-slate-400 font-normal">(Optional)</span>}</Label>
                                <Textarea
                                    value={regenerationPrompt}
                                    onChange={(e) => {
                                        setRegenerationPrompt(e.target.value)
                                        // If user edits the auto-populated text, mark as manual
                                        if (promptWasAutoPopulated && e.target.value !== ENV_AUTO_PROMPT) {
                                            setPromptWasAutoPopulated(false)
                                        }
                                    }}
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
                                        <Label className="text-sm font-medium">Add Images (Optional)</Label>
                                        <span className="text-xs text-slate-400">{referenceImages.length}/5 • Max 10MB</span>
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
                                                    <img src={img.preview} alt="Ref" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
                                        <div
                                            onDragOver={handleRefDragOver}
                                            onDrop={handleRefDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full border-2 border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center gap-1 h-16 text-slate-500 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-50 cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <Upload className="w-4 h-4" />
                                                Drop, paste, or click to add
                                            </div>
                                        </div>
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
                                                                        loading="lazy"
                                                                        decoding="async"
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
                                                                    <img src={char.imageUrl} alt={char.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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

                        <DialogFooter className="flex items-center !justify-between">
                            <div className="flex items-center">
                                {illustrationModel === 'nb2' && (
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="thinking-mode"
                                            checked={useThinkingMode}
                                            onCheckedChange={setUseThinkingMode}
                                            className="scale-90"
                                        />
                                        <label htmlFor="thinking-mode" className="text-xs text-slate-500 cursor-pointer select-none">
                                            Deep thinking
                                        </label>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                            {/* Reset to Original button — only when original exists, not already showing it, and no custom input */}
                            {hasOriginal && !isShowingOriginal && !regenerationPrompt.trim() && referenceImages.length === 0 && !isSceneRecreationMode && (
                                <Button
                                    onClick={async () => {
                                        setIsResettingToOriginal(true)
                                        setIsRegenerateDialogOpen(false)
                                        try {
                                            const res = await fetch('/api/illustrations/reset-to-original', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ pageId: page.id, projectId })
                                            })
                                            if (!res.ok) {
                                                const data = await res.json().catch(() => ({}))
                                                throw new Error(data.error || 'Failed to reset')
                                            }

                                            // Force page refresh to update the UI
                                            window.location.reload()
                                        } catch (err) {
                                            console.error('Failed to reset illustration to original:', err)
                                        } finally {
                                            setIsResettingToOriginal(false)
                                        }
                                    }}
                                    disabled={isResettingToOriginal}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                    {isResettingToOriginal ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                            Restoring...
                                        </>
                                    ) : "Reset to Original"}
                                </Button>
                            )}

                            {/* Regenerate / Recreate Scene button */}
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
                                    
                                    // Save prompt to localStorage (scoped to current round's feedback)
                                    if (regenerationPrompt.trim()) {
                                        const currentFeedback = (page.feedback_notes && !page.is_resolved) ? page.feedback_notes : ''
                                        localStorage.setItem(`regen-prompt-${page.id}`, JSON.stringify({
                                            prompt: regenerationPrompt,
                                            feedbackKey: currentFeedback
                                        }))
                                    }
                                    
                                    const resolvedModelId = illustrationModel === 'nb-pro'
                                        ? 'gemini-3-pro-image-preview'
                                        : illustrationModel === 'gpt-2'
                                            ? 'gpt-image-2'
                                            : undefined
                                    setIsRegenerateDialogOpen(false)
                                    onRegenerate(regenerationPrompt, base64Images, refUrl, includedChars, useThinkingMode, resolvedModelId)
                                }}
                                disabled={isSceneRecreationMode && sceneCharacters.filter(c => c.isIncluded).length === 0}
                                className={
                                    isSceneRecreationMode 
                                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                                        : ""
                                }
                            >
                                {isSceneRecreationMode 
                                    ? "Recreate Scene"
                                    : "Regenerate"}
                            </Button>
                            </div>
                        </DialogFooter>
                    </DialogContent>
	                </Dialog>
	            )}

		            {/* ADMIN REMASTER DIALOG */}
	            {isAdmin && onRegenerate && (
	                <Dialog open={isRemasterDialogOpen} onOpenChange={(open) => {
                    setIsRemasterDialogOpen(open)
                    if (!open) resetRemasterOptions()
                }}>
                    <DialogContent className="left-3 right-3 top-[calc(env(safe-area-inset-top)+1rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)] flex max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-xl p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:grid sm:w-full sm:max-w-[640px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:gap-4 sm:max-h-[90vh] sm:overflow-y-auto sm:p-6">
                        <DialogHeader className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4 text-left sm:border-0 sm:p-0">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-8">
                                <DialogTitle className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-purple-600" />
                                    Remaster Illustration
                                </DialogTitle>
                                <Select value={remasterModel} onValueChange={(value) => setRemasterModel(value as IllustrationModelId)}>
                                    <SelectTrigger className="w-full sm:w-[150px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="nb2">NB2</SelectItem>
                                        <SelectItem value="nb-pro">NB Pro</SelectItem>
                                        <SelectItem value="gpt-2">GPT 2</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogDescription className="sr-only">
                                Compare the current illustration with a quality reference and remaster this page.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:overflow-visible sm:px-0 sm:py-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex flex-col">
                                    <div className="flex h-9 items-center px-3 text-sm font-medium text-slate-700 bg-white border-b border-slate-200">
                                        Current Image
                                    </div>
                                    <div className="m-2 flex h-72 items-center justify-center rounded-lg bg-white p-2 sm:h-[360px]">
                                        {page.illustration_url ? (
                                            <img src={page.illustration_url} alt={`Page ${page.page_number}`} loading={feedImageLoading} decoding="async" className="h-full w-full object-contain rounded" />
                                        ) : (
                                            <BookImage className="w-8 h-8 text-slate-300" />
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex flex-col">
                                    <div className="flex h-9 items-stretch bg-white border-b border-slate-200">
                                        <div className="flex min-w-0 flex-1 items-stretch">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button
                                                        type="button"
                                                        disabled={illustratedPages.length === 0}
                                                        className="flex h-full w-full min-w-0 cursor-pointer items-center justify-between gap-2 px-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white"
                                                    >
                                                        <span className="truncate">
                                                            {remasterUpload
                                                                ? 'Uploaded reference'
                                                                : selectedRemasterReferencePage
                                                                ? `Page ${selectedRemasterReferencePage.page_number}`
                                                                : illustratedPages.length > 0 ? 'Select reference page' : 'No pages available'}
                                                        </span>
                                                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="w-[calc(100vw-3rem)] max-h-[260px] overflow-y-auto sm:w-[var(--radix-dropdown-menu-trigger-width)] sm:min-w-[220px]" align="start">
                                                    {illustratedPages.map(refPage => (
                                                        <DropdownMenuItem
                                                            key={refPage.id}
                                                            onClick={() => {
                                                                setRemasterReferencePageId(refPage.id)
                                                                setRemasterUpload(null)
                                                            }}
                                                            className="cursor-pointer flex items-center gap-2.5 py-2"
                                                        >
                                                            {refPage.illustration_url ? (
                                                                <img
                                                                    src={refPage.illustration_url}
                                                                    alt={`Page ${refPage.page_number}`}
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    className="w-10 h-10 rounded object-cover border border-slate-200 flex-shrink-0"
                                                                />
                                                            ) : null}
                                                            <span>Page {refPage.page_number}</span>
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <input
                                        ref={remasterFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleRemasterReferenceSelect}
                                    />
                                    <div
                                        className={`relative m-2 flex h-72 items-center justify-center rounded-lg transition-colors sm:h-[360px] ${
                                            selectedRemasterReferencePage?.illustration_url || remasterUpload
                                                ? 'bg-white p-2'
                                                : 'border-2 border-dashed border-purple-300 bg-purple-50/20 hover:bg-purple-50 p-4'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => remasterFileInputRef.current?.click()}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={handleRemasterReferenceDrop}
                                            className="flex h-full w-full cursor-pointer items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                                        >
                                            {selectedRemasterReferencePage?.illustration_url ? (
                                                <img
                                                    src={selectedRemasterReferencePage.illustration_url}
                                                    alt={`Page ${selectedRemasterReferencePage.page_number} reference`}
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="h-full w-full object-contain rounded"
                                                />
                                            ) : remasterUpload ? (
                                                <img src={remasterUpload.preview} alt="Uploaded quality reference" loading="lazy" decoding="async" className="h-full w-full object-contain rounded" />
                                            ) : (
                                                <span className="flex flex-col items-center gap-2 text-center text-sm text-slate-500">
                                                    <Upload className="w-8 h-8 text-slate-400" />
                                                    <span className="font-medium text-slate-700">Upload quality reference</span>
                                                    <span className="text-xs text-slate-400">Drop image or click to browse</span>
                                                </span>
                                            )}
                                        </button>
                                        {(selectedRemasterReferencePage?.illustration_url || remasterUpload) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRemasterReferencePageId(null)
                                                    setRemasterUpload(null)
                                                }}
                                                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                                                aria-label="Clear quality reference"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white">
                                <button
                                    type="button"
                                    onClick={() => setIsRemasterPromptOpen(open => !open)}
                                    className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-800"
                                    aria-expanded={isRemasterPromptOpen}
                                    aria-controls={`remaster-prompt-${page.id}`}
                                >
                                    <span>Prompt</span>
                                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isRemasterPromptOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isRemasterPromptOpen && (
                                    <div className="border-t border-slate-200 p-3">
                                        <Textarea
                                            id={`remaster-prompt-${page.id}`}
                                            value={remasterPrompt}
                                            onChange={(event) => setRemasterPrompt(event.target.value)}
                                            className="min-h-[160px] resize-y text-sm"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:border-0 sm:bg-transparent sm:p-0 sm:flex-row sm:items-center">
                            <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:justify-end sm:gap-3">
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => setIsRemasterDialogOpen(false)}
                                    className="w-full sm:w-auto"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleRemasterSubmit}
                                    disabled={remasterSubmitDisabled}
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white sm:w-auto"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Remaster
                                </Button>
                            </div>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* ADMIN LAYOUT CHANGE DIALOG */}
            {isAdmin && onLayoutChange && (
                <Dialog open={isLayoutDialogOpen} onOpenChange={(open) => {
                    setIsLayoutDialogOpen(open)
                    if (!open) {
                        setSelectedLayoutType(currentIllustrationType)
                    }
                }}>
                    <DialogContent className="sm:max-w-[380px]">
                        <DialogHeader>
                            <DialogTitle>Change Layout</DialogTitle>
                            <DialogDescription>
                                Select a new layout type for this illustration.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4">
                            <RadioGroup 
                                value={selectedLayoutType || 'normal'} 
                                onValueChange={(value) => setSelectedLayoutType(value === 'normal' ? null : value as 'spread' | 'spot')}
                                className="space-y-3"
                            >
                                {/* Single Page (Normal) */}
                                <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                                    selectedLayoutType === null 
                                        ? 'border-blue-500 bg-blue-50' 
                                        : 'border-slate-200 hover:border-slate-300'
                                }`} onClick={() => setSelectedLayoutType(null)}>
                                    <RadioGroupItem value="normal" id="layout-normal" className="text-blue-600" />
                                    <Label htmlFor="layout-normal" className="flex-1 cursor-pointer">
                                        <span className="font-medium">Single Page</span>
                                        {currentIllustrationType === null && (
                                            <span className="ml-2 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">current</span>
                                        )}
                                    </Label>
                                </div>

                                {/* Spot Image */}
                                <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                                    selectedLayoutType === 'spot' 
                                        ? 'border-pink-500 bg-pink-50' 
                                        : 'border-slate-200 hover:border-slate-300'
                                }`} onClick={() => setSelectedLayoutType('spot')}>
                                    <RadioGroupItem value="spot" id="layout-spot" className="text-pink-600" />
                                    <Label htmlFor="layout-spot" className="flex-1 cursor-pointer">
                                        <span className="font-medium">Spot Image</span>
                                        {currentIllustrationType === 'spot' && (
                                            <span className="ml-2 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">current</span>
                                        )}
                                    </Label>
                                </div>

                                {/* Spread Image */}
                                <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                                    selectedLayoutType === 'spread' 
                                        ? 'border-purple-500 bg-purple-50' 
                                        : 'border-slate-200 hover:border-slate-300'
                                }`} onClick={() => setSelectedLayoutType('spread')}>
                                    <RadioGroupItem value="spread" id="layout-spread" className="text-purple-600" />
                                    <Label htmlFor="layout-spread" className="flex-1 cursor-pointer">
                                        <span className="font-medium">Spread Image</span>
                                        {currentIllustrationType === 'spread' && (
                                            <span className="ml-2 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">current</span>
                                        )}
                                    </Label>
                                </div>
                            </RadioGroup>

                            {/* Warning */}
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-sm text-amber-800">
                                    <strong>Note:</strong> This will regenerate the illustration immediately with the new layout.
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsLayoutDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={() => {
                                    setIsLayoutDialogOpen(false)
                                    onLayoutChange(selectedLayoutType)
                                }}
                                disabled={selectedLayoutType === currentIllustrationType}
                                className="bg-violet-600 hover:bg-violet-700 text-white"
                            >
                                Change Layout
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {isCustomer && onApprovePage && (
                <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{approvalTitle}</DialogTitle>
                            <DialogDescription className="text-base pt-2">
                                Great, we’re one step closer to finalizing your {approvalPlural}. 🎉
                            </DialogDescription>
                        </DialogHeader>
                        {approvalTotalCount > 0 && (
                            <div className="space-y-2 py-2">
                                <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                                    <span>{approvalPlural.charAt(0).toUpperCase() + approvalPlural.slice(1)} approved</span>
                                    <span>{Math.min(approvalApprovedCount + (isPageApproved ? 0 : 1), approvalTotalCount)}/{approvalTotalCount}</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700 ease-out"
                                        style={{ width: approvalTotalCount > 0 ? ((Math.min(approvalApprovedCount + (isPageApproved ? 0 : 1), approvalTotalCount) / approvalTotalCount) * 100) + '%' : '0%' }}
                                    />
                                </div>
                            </div>
                        )}
                        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                            <Button variant="outline" onClick={() => setShowApprovalDialog(false)} disabled={isApprovingPage}>
                                Cancel
                            </Button>
                            <Button onClick={handleApprovePageClick} disabled={isApprovingPage} className="bg-green-600 hover:bg-green-700 text-white font-semibold">
                                {isApprovingPage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                Approve
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Cover Generation Modal (Admin only) */}
            {isAdmin && projectId && (
                <CoverModal
                    open={isCoverModalOpen}
                    onOpenChange={setIsCoverModalOpen}
                    projectId={projectId}
                    pageId={page.id}
                    pageNumber={page.page_number}
                    onCoverCreated={onCoverCreated}
                />
            )}
        </div>
    )
}
