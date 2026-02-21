'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Save, Edit, Trash2, Loader2, User, Check, Lock, Camera, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Character } from '@/types/character'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export interface CharacterFormData {
    age: string | null
    gender: string | null
    skin_color: string | null
    hair_color: string | null
    hair_style: string | null
    eye_color: string | null
    clothing: string | null
    accessories: string | null
    special_features: string | null
}

interface InternalCharacterFormData {
    age: string
    gender: string
    skin_color: string
    hair_color: string
    hair_style: string
    eye_color: string
    clothing_and_accessories: string
}

const MIN_PHOTO_DIMENSION = 300
const MAX_PHOTO_SIZE = 10 * 1024 * 1024
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']

const validateForm = (data: InternalCharacterFormData): boolean => {
    return !!(
        data.age?.trim() &&
        data.gender?.trim() &&
        data.skin_color?.trim() &&
        data.hair_color?.trim() &&
        data.hair_style?.trim() &&
        data.eye_color?.trim() &&
        data.clothing_and_accessories?.trim()
    )
}

function validatePhotoFile(file: File): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
        if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
            resolve({ valid: false, error: 'Please upload a JPG, PNG, or HEIC image.' })
            return
        }
        if (file.size > MAX_PHOTO_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
            resolve({ valid: false, error: `File is too large (${sizeMB}MB). Please upload an image under 10MB.` })
            return
        }
        if (file.type === 'image/heic' || file.type === 'image/heif') {
            resolve({ valid: true })
            return
        }
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(url)
            const shortest = Math.min(img.width, img.height)
            if (shortest < MIN_PHOTO_DIMENSION) {
                resolve({ valid: false, error: `Photo resolution is too low (${img.width}×${img.height}). Please upload a higher quality image.` })
            } else {
                resolve({ valid: true })
            }
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve({ valid: false, error: 'Could not read this image. Please try a different file.' })
        }
        img.src = url
    })
}

export interface UniversalCharacterCardProps {
    character: Character
    onSave: (data: CharacterFormData) => Promise<void>
    onDelete?: () => Promise<void>
    isGenerating?: boolean
    className?: string
    readOnly?: boolean
    alwaysEditing?: boolean
    hideSaveButton?: boolean
    onChange?: (data: CharacterFormData, isValid: boolean) => void
    isLocked?: boolean
    enablePhotoUpload?: boolean
    onPhotoUploaded?: (characterId: string, url: string) => void
    onPhotoRemoved?: (characterId: string) => void
}

export const UniversalCharacterCard = memo(function UniversalCharacterCard({
    character,
    onSave,
    onDelete,
    isGenerating = false,
    className,
    readOnly = false,
    alwaysEditing = false,
    hideSaveButton = false,
    onChange,
    isLocked = false,
    enablePhotoUpload = false,
    onPhotoUploaded,
    onPhotoRemoved,
}: UniversalCharacterCardProps) {
    const [isEditing, setIsEditing] = useState(alwaysEditing)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const [formData, setFormData] = useState<InternalCharacterFormData>({
        age: '',
        gender: '',
        skin_color: '',
        hair_color: '',
        hair_style: '',
        eye_color: '',
        clothing_and_accessories: '',
    })

    const [initialData, setInitialData] = useState<InternalCharacterFormData | null>(null)
    const [highlightMissing, setHighlightMissing] = useState(false)
    const [focusedField, setFocusedField] = useState<string | null>(null)

    // Photo upload state
    const [referencePhotoUrl, setReferencePhotoUrl] = useState<string | null>(character.reference_photo_url || null)
    const [uploadingPhoto, setUploadingPhoto] = useState(false)
    const photoInputRef = useRef<HTMLInputElement>(null)

    const hasPhoto = !!referencePhotoUrl

    useEffect(() => {
        setReferencePhotoUrl(character.reference_photo_url || null)
    }, [character.reference_photo_url])

    useEffect(() => {
        const savedData = {
            age: character.age || '',
            gender: character.gender || '',
            skin_color: character.skin_color || '',
            hair_color: character.hair_color || '',
            hair_style: character.hair_style || '',
            eye_color: character.eye_color || '',
            clothing_and_accessories: [
                character.clothing,
                character.accessories,
                character.special_features,
            ]
                .filter(Boolean)
                .join('\n') || '',
        }
        setFormData(savedData)
        setInitialData(savedData)

        const isComplete = hasPhoto || validateForm(savedData)
        if (!readOnly && (alwaysEditing || !isComplete)) {
            setIsEditing(true)
        }

        if (onChange) {
            const isValid = hasPhoto || validateForm(savedData)
            onChange({
                age: savedData.age || null,
                gender: savedData.gender || null,
                skin_color: savedData.skin_color || null,
                hair_color: savedData.hair_color || null,
                hair_style: savedData.hair_style || null,
                eye_color: savedData.eye_color || null,
                clothing: savedData.clothing_and_accessories || null,
                accessories: null,
                special_features: null,
            }, isValid)
        }
    }, [character, isGenerating, readOnly, alwaysEditing])

    const notifyChange = (newData: InternalCharacterFormData) => {
        if (!onChange) return
        const isValid = hasPhoto || validateForm(newData)
        const outputData: CharacterFormData = {
            age: newData.age || null,
            gender: newData.gender || null,
            skin_color: newData.skin_color || null,
            hair_color: newData.hair_color || null,
            hair_style: newData.hair_style || null,
            eye_color: newData.eye_color || null,
            clothing: newData.clothing_and_accessories || null,
            accessories: null,
            special_features: null,
        }
        onChange(outputData, isValid)
    }

    const hasAnyContent = (data: InternalCharacterFormData) => {
        return Object.values(data).some(v => v && v.trim().length > 0)
    }

    const handleInputChange = (field: string, value: string) => {
        const newData = { ...formData, [field]: value }
        setFormData(newData)
        notifyChange(newData)
    }

    const handleTextareaChange = (value: string) => {
        const newData = { ...formData, clothing_and_accessories: value }
        setFormData(newData)
        notifyChange(newData)
    }

    // Photo upload handlers
    const handlePhotoSelect = useCallback(async (file: File) => {
        setUploadingPhoto(true)
        const result = await validatePhotoFile(file)
        if (!result.valid) {
            toast.error(result.error)
            setUploadingPhoto(false)
            return
        }

        try {
            const fd = new FormData()
            fd.append('file', file)
            const response = await fetch(`/api/review/characters/${character.id}/reference-photo`, {
                method: 'POST',
                body: fd,
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Upload failed')
            }

            const { url } = await response.json()
            setReferencePhotoUrl(url)
            onPhotoUploaded?.(character.id, url)
            toast.success('Photo uploaded — text fields are now optional')

            if (onChange) {
                onChange({
                    age: formData.age || null,
                    gender: formData.gender || null,
                    skin_color: formData.skin_color || null,
                    hair_color: formData.hair_color || null,
                    hair_style: formData.hair_style || null,
                    eye_color: formData.eye_color || null,
                    clothing: formData.clothing_and_accessories || null,
                    accessories: null,
                    special_features: null,
                }, true)
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Upload failed'
            toast.error(msg)
        } finally {
            setUploadingPhoto(false)
        }
    }, [character.id, formData, onChange, onPhotoUploaded])

    const handleRemovePhoto = useCallback(async () => {
        try {
            await fetch(`/api/review/characters/${character.id}/reference-photo`, { method: 'DELETE' })
            setReferencePhotoUrl(null)
            onPhotoRemoved?.(character.id)
            toast('Photo removed')

            if (onChange) {
                const isValid = validateForm(formData)
                onChange({
                    age: formData.age || null,
                    gender: formData.gender || null,
                    skin_color: formData.skin_color || null,
                    hair_color: formData.hair_color || null,
                    hair_style: formData.hair_style || null,
                    eye_color: formData.eye_color || null,
                    clothing: formData.clothing_and_accessories || null,
                    accessories: null,
                    special_features: null,
                }, isValid)
            }
        } catch {
            toast.error('Failed to remove photo')
        }
    }, [character.id, formData, onChange, onPhotoRemoved])

    const handlePhotoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handlePhotoSelect(file)
        if (photoInputRef.current) photoInputRef.current.value = ''
    }

    const handleSaveWrapper = async () => {
        setSaving(true)
        try {
            await onSave({
                age: formData.age || null,
                gender: formData.gender || null,
                skin_color: formData.skin_color || null,
                hair_color: formData.hair_color || null,
                hair_style: formData.hair_style || null,
                eye_color: formData.eye_color || null,
                clothing: formData.clothing_and_accessories || null,
                accessories: null,
                special_features: null,
            })

            setInitialData(formData)

            if (!alwaysEditing) {
                setIsEditing(false)
            }
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteWrapper = async () => {
        if (!onDelete) return;
        setDeleting(true)
        try {
            await onDelete()
        } finally {
            setDeleting(false)
        }
    }

    const displayName = character.name || character.role || (character.is_main ? 'Main Character' : 'Character')
    const isMainCharacter = character.is_main
    const hasImage = !!character.image_url
    const showLoadingState = isGenerating && !hasImage

    const isFormComplete = hasPhoto || validateForm(formData)
    const editMode = (isEditing || alwaysEditing || !isFormComplete) && !readOnly

    const isFormValid = isFormComplete
    const hasContent = hasAnyContent(formData)
    const showHighlight = editMode && !hasPhoto && hasContent && !validateForm(formData)

    const renderField = (label: string, fieldKey: keyof typeof formData, placeholder: string) => {
        const isFilled = formData[fieldKey] && formData[fieldKey].trim().length > 0
        const showCheck = isFilled && focusedField !== fieldKey

        return (
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    {showCheck && editMode && (
                        <div className="w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center animate-in fade-in zoom-in duration-200">
                            <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </div>
                    )}
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {label}
                        {hasPhoto && editMode && <span className="text-gray-300 font-normal normal-case ml-1">(optional)</span>}
                        {!hasPhoto && showHighlight && !formData[fieldKey] && <span className="text-orange-500 ml-0.5">*</span>}
                    </label>
                </div>
                {editMode ? (
                    <div className="relative">
                        <Input
                            value={formData[fieldKey]}
                            onChange={(e) => handleInputChange(fieldKey, e.target.value)}
                            onFocus={() => setFocusedField(fieldKey)}
                            onBlur={() => setFocusedField(null)}
                            placeholder={hasPhoto ? `Optional — ${placeholder}` : placeholder}
                            className="h-9 text-sm bg-white transition-all duration-200"
                            style={showHighlight && !formData[fieldKey] ? {
                                borderColor: '#f97316',
                                backgroundColor: '#fff7ed',
                                boxShadow: '0 0 0 2px #fed7aa'
                            } : {}}
                        />
                        {showHighlight && !formData[fieldKey] && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-orange-500 pointer-events-none hidden md:inline">REQUIRED</span>
                        )}
                    </div>
                ) : (
                    <div className="min-h-[1.5rem] flex items-center">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {formData[fieldKey] || <span className="text-gray-400 font-normal italic">Not specified</span>}
                        </p>
                    </div>
                )}
            </div>
        )
    }

    return (
        <Card id={`character-${character.id}`} className={cn(
            "w-full transition-all duration-300 relative overflow-hidden group",
            isLocked
                ? "border-gray-200 bg-gray-50/50 opacity-75"
                : !isFormValid
                    ? "border-amber-200 shadow-[0_0_15px_-3px_rgba(251,191,36,0.15)] bg-amber-50/10"
                    : !editMode
                        ? "border-green-200 shadow-[0_0_15px_-3px_rgba(34,197,94,0.15)] bg-green-50/10"
                        : "border-gray-200 shadow-sm hover:shadow-md",
            className
        )}>
            {/* Status Strip */}
            <div className={cn(
                "absolute left-0 top-0 right-0 h-1 transition-colors duration-300",
                isLocked ? "bg-gray-300" : (!isFormValid ? "bg-amber-400" : (!editMode ? "bg-green-500" : "bg-transparent"))
            )} />
            
            {/* Locked Overlay */}
            {isLocked && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-30 flex items-center justify-center">
                    <div className="bg-white/90 rounded-lg px-4 py-3 shadow-sm border border-gray-200 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-500">Complete the previous form first</span>
                    </div>
                </div>
            )}
            <CardContent className="p-6">
                {/* Hidden file input for photo upload */}
                {enablePhotoUpload && (
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                        className="hidden"
                        onChange={handlePhotoInputChange}
                    />
                )}

                {/* Delete button (Top Right, absolute) - only if onDelete is provided */}
                {!isMainCharacter && onDelete && (
                    <div className="absolute top-4 right-4 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={deleting}
                                    className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Character</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to delete &quot;{displayName}&quot;? This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDeleteWrapper}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}

                {/* Deleting Loading Overlay */}
                {deleting && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center backdrop-blur-[1px]">
                        <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-2" />
                        <p className="text-sm font-medium text-red-600 animate-pulse">Deleting...</p>
                    </div>
                )}

                <div className="flex flex-col gap-6">

                    {/* Top Section: Header + Photo Upload / Image */}
                    <div className="flex flex-col md:flex-row justify-between gap-4">

                        {/* Header Info (Left) */}
                        <div className="space-y-1 flex-1 pr-4">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-gray-900 tracking-tight">{displayName}</h3>
                                {isMainCharacter && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                                        Main
                                    </span>
                                )}
                                {isFormValid ? (
                                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-100 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                        Ready
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-100 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                        Pending
                                    </span>
                                )}
                            </div>
                            {character.story_role && (
                                <p className="text-sm text-gray-500 font-medium leading-relaxed line-clamp-6">{character.story_role}</p>
                            )}

                            {/* Photo uploaded banner */}
                            {hasPhoto && editMode && (
                                <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-md bg-green-50 border border-green-100 w-fit">
                                    <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                                    <span className="text-xs font-medium text-green-700">Photo uploaded — text fields are now optional</span>
                                </div>
                            )}
                        </div>

                        {/* Right Side: Photo Upload Zone OR Generated Image */}
                        {enablePhotoUpload && !showLoadingState && !character.generation_error && !character.image_url ? (
                            <div className="flex-shrink-0">
                                {referencePhotoUrl ? (
                                    <div className="relative w-28 h-28 md:w-32 md:h-32 group/photo">
                                        <div className="w-full h-full rounded-xl overflow-hidden border-2 border-green-200 shadow-sm">
                                            <img
                                                src={referencePhotoUrl}
                                                alt="Reference photo"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        {editMode && (
                                            <button
                                                onClick={handleRemovePhoto}
                                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-all opacity-0 group-hover/photo:opacity-100 z-10"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => photoInputRef.current?.click()}
                                        disabled={uploadingPhoto || isLocked}
                                        className={cn(
                                            "w-28 h-28 md:w-32 md:h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer",
                                            uploadingPhoto
                                                ? "border-blue-300 bg-blue-50"
                                                : "border-amber-300 bg-amber-50/40 hover:border-amber-400 hover:bg-amber-50/70 hover:shadow-sm"
                                        )}
                                    >
                                        {uploadingPhoto ? (
                                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                                        ) : (
                                            <>
                                                <Camera className="w-6 h-6 text-amber-500" />
                                                <span className="text-[11px] font-semibold text-amber-600 text-center leading-tight px-1">
                                                    Add photo
                                                </span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* Original image display for generated/generating states */
                            (showLoadingState || character.generation_error || character.image_url) && (
                            <div className="flex-shrink-0 md:w-32 lg:w-40 flex flex-col items-center md:items-end space-y-3">
                                {showLoadingState ? (
                                    <div className="w-32 h-32 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-xl border border-gray-100 bg-gray-50 flex flex-col items-center justify-center relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-white/50 animate-pulse" />
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin relative z-10" />
                                        <span className="text-xs font-medium text-blue-600 mt-2 relative z-10">Generating...</span>
                                    </div>
                                ) : character.generation_error ? (
                                    <div className="w-32 h-32 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center text-red-500 gap-2 p-2 text-center">
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Generation Failed</span>
                                        <span className="text-[10px] leading-tight opacity-75 line-clamp-3">{character.generation_error}</span>
                                    </div>
                                ) : character.image_url ? (
                                    <div className="relative group perspective-1000">
                                        <div className="w-32 h-32 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-xl shadow-sm border border-gray-100 overflow-hidden bg-white relative hover:shadow-md transition-all duration-300 hover:scale-[1.02]">
                                            <img
                                                src={character.image_url}
                                                alt={displayName}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        {isGenerating === false && (
                                            <div className="absolute -bottom-2 -right-2 bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-100 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                READY
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                            )
                        )}
                    </div>

                    {/* Bottom Section: Full Width Grid + Details */}
                    <div className="space-y-6">

                        {/* Grid Attributes */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-5 w-full">
                            {renderField('Age', 'age', 'e.g. 7 years old')}
                            {renderField('Gender', 'gender', 'e.g. Female')}

                            {renderField('Skin Color', 'skin_color', 'e.g. Light brown')}
                            {renderField('Eye Color', 'eye_color', 'e.g. Hazel')}

                            {renderField('Hair Color', 'hair_color', 'e.g. Dark brown')}
                            {renderField('Hair Style', 'hair_style', 'e.g. Curly')}
                        </div>

                        {/* Full Width Clothing Section */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                {formData.clothing_and_accessories && formData.clothing_and_accessories.trim().length > 0 && focusedField !== 'clothing_and_accessories' && editMode && (
                                    <div className="w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center animate-in fade-in zoom-in duration-200">
                                        <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                                    </div>
                                )}
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Clothing & Visual Details
                                    {hasPhoto && editMode && <span className="text-gray-300 font-normal normal-case ml-1">(optional)</span>}
                                </label>
                            </div>
                            {editMode ? (
                                <Textarea
                                    value={formData.clothing_and_accessories}
                                    onChange={(e) => handleTextareaChange(e.target.value)}
                                    onFocus={() => setFocusedField('clothing_and_accessories')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder={hasPhoto
                                        ? "Optional — Add any details about clothing or accessories you'd like in the illustration..."
                                        : "Describe clothing, accessories, and any distinct visual features..."
                                    }
                                    rows={4}
                                    className="text-sm resize-none bg-white leading-relaxed transition-all duration-200"
                                    style={showHighlight && !formData.clothing_and_accessories ? {
                                        borderColor: '#f97316',
                                        backgroundColor: '#fff7ed',
                                        boxShadow: '0 0 0 2px #fed7aa'
                                    } : {}}
                                />
                            ) : (
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 min-h-[5rem]">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {formData.clothing_and_accessories || <span className="text-gray-400 italic">No visual details provided.</span>}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Actions Footer */}
                        {!readOnly && !hideSaveButton && (
                            <div className={cn("flex items-center pt-2", alwaysEditing ? "justify-center" : "")}>
                                {editMode ? (
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={handleSaveWrapper}
                                            disabled={saving || !isFormComplete}
                                            size="sm"
                                            className={cn(
                                                "min-w-[100px]",
                                                alwaysEditing
                                                    ? "bg-green-600 hover:bg-green-700 text-white shadow-sm border border-green-700/10"
                                                    : "bg-blue-600 hover:bg-blue-700 text-white"
                                            )}
                                        >
                                            {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                                            {alwaysEditing ? 'Save' : 'Save Details'}
                                        </Button>

                                        {!alwaysEditing && (
                                            <Button
                                                onClick={() => {
                                                    setIsEditing(false)
                                                    setFormData({
                                                        age: character.age || '',
                                                        gender: character.gender || '',
                                                        skin_color: character.skin_color || '',
                                                        hair_color: character.hair_color || '',
                                                        hair_style: character.hair_style || '',
                                                        eye_color: character.eye_color || '',
                                                        clothing_and_accessories: [
                                                            character.clothing,
                                                            character.accessories,
                                                            character.special_features,
                                                        ].filter(Boolean).join('\n') || '',
                                                    })
                                                }}
                                                variant="ghost"
                                                size="sm"
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        {!isMainCharacter && (
                                            <Button
                                                onClick={() => setIsEditing(true)}
                                                variant="outline"
                                                size="sm"
                                                className="text-gray-600 hover:text-gray-900 border-gray-200 hover:border-gray-300 bg-white"
                                            >
                                                <Edit className="w-3.5 h-3.5 mr-2" />
                                                Edit Details
                                            </Button>
                                        )}

                                        {!isMainCharacter && onDelete && (
                                            <div className="block md:hidden">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="outline" size="sm" className="text-red-500 border-red-100 hover:bg-red-50">
                                                            Delete
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete Character</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Are you sure? This cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleDeleteWrapper} className="bg-red-600">Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </CardContent>
        </Card >
    )
})
