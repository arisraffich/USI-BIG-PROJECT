'use client'

import { useState, useEffect, memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Save, Edit, Trash2, Loader2, User } from 'lucide-react'
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



// Helper to validate if all fields are filled
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
    onChange
}: UniversalCharacterCardProps) {
    const [isEditing, setIsEditing] = useState(alwaysEditing)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // Form State (Internal)
    const [formData, setFormData] = useState<InternalCharacterFormData>({
        age: '',
        gender: '',
        skin_color: '',
        hair_color: '',
        hair_style: '',
        eye_color: '',
        clothing_and_accessories: '',
    })

    // Track original data for dirty checking
    const [initialData, setInitialData] = useState<InternalCharacterFormData | null>(null)

    // Reset form data when character changes
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

        if (alwaysEditing && !readOnly) {
            setIsEditing(true)
        }

        // Initial validation and bubble up
        if (onChange) {
            const isValid = validateForm(savedData)
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
    }, [character, isGenerating, readOnly, alwaysEditing]) // removed onChange to avoid circular deps if not memoized upstream

    // Helper to bubble up changes
    const notifyChange = (newData: InternalCharacterFormData) => {
        if (!onChange) return
        const isValid = validateForm(newData)
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

    // Check if form is dirty
    const isDirty = initialData ? JSON.stringify(formData) !== JSON.stringify(initialData) : false

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

            // Update initialData to current to reset dirty state immediately
            setInitialData(formData)

            // If alwaysEditing, we stay in edit mode
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

    // Determine effective edit state
    const editMode = (isEditing || alwaysEditing) && !readOnly

    // Helper to render a field label and value/input
    const renderField = (label: string, fieldKey: keyof typeof formData, placeholder: string) => (
        <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
            {editMode ? (
                <Input
                    value={formData[fieldKey]}
                    onChange={(e) => handleInputChange(fieldKey, e.target.value)}
                    placeholder={placeholder}
                    className="h-9 text-sm bg-white"
                />
            ) : (
                <div className="min-h-[1.5rem] flex items-center">
                    <p className="text-sm font-medium text-gray-900 truncate">
                        {formData[fieldKey] || <span className="text-gray-400 font-normal italic">Not specified</span>}
                    </p>
                </div>
            )}
        </div>
    )

    return (
        <Card id={`character-${character.id}`} className={cn(
            "overflow-hidden transition-all duration-200 bg-white border-gray-200 shadow-sm relative group",
            editMode ? "ring-2 ring-blue-500/10 shadow-md" : "hover:shadow-md",
            className
        )}>
            <CardContent className="p-6">
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
                                        Are you sure you want to delete "{displayName}"? This action cannot be undone.
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

                    {/* Top Section: Header + Image */}
                    <div className="flex flex-col-reverse md:flex-row justify-between gap-6">

                        {/* Header Info (Left) */}
                        <div className="space-y-1 flex-1 pr-4">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-gray-900 tracking-tight">{displayName}</h3>
                                {isMainCharacter && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                                        Main
                                    </span>
                                )}
                            </div>
                            {character.story_role && (
                                <p className="text-sm text-gray-500 font-medium leading-relaxed line-clamp-6">{character.story_role}</p>
                            )}
                        </div>

                        {/* Image (Right) */}
                        <div className="flex-shrink-0 md:w-32 lg:w-40 flex flex-col items-center md:items-end space-y-3">
                            {showLoadingState ? (
                                <div className="w-32 h-32 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-xl border border-gray-100 bg-gray-50 flex flex-col items-center justify-center relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-white/50 animate-pulse" />
                                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin relative z-10" />
                                    <span className="text-xs font-medium text-blue-600 mt-2 relative z-10">Generating...</span>
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
                                    {/* Status Indicator */}
                                    {isGenerating === false && (
                                        <div className="absolute -bottom-2 -right-2 bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-100 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                            READY
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-32 h-32 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400 gap-2">
                                    <User className="w-10 h-10 opacity-20" />
                                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-40">No Image</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Section: Full Width Grid + Details */}
                    <div className="space-y-6">

                        {/* Grid Attributes - 2 Column Layout - Full Width */}
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
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Clothing & Visual Details
                            </label>
                            {editMode ? (
                                <Textarea
                                    value={formData.clothing_and_accessories}
                                    onChange={(e) => handleTextareaChange(e.target.value)}
                                    placeholder="Describe clothing, accessories, and any distinct visual features..."
                                    rows={4}
                                    className="text-sm resize-none bg-white leading-relaxed"
                                />
                            ) : (
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 min-h-[5rem]">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {formData.clothing_and_accessories || <span className="text-gray-400 italic">No visual details provided.</span>}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Actions Footer - Visible only if not readOnly AND hideSaveButton is false */}
                        {!readOnly && !hideSaveButton && (
                            <div className={cn("flex items-center pt-2", alwaysEditing ? "justify-center" : "")}>
                                {editMode ? (
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={handleSaveWrapper}
                                            disabled={saving || (alwaysEditing && !isDirty)}
                                            size="sm"
                                            className={cn(
                                                "min-w-[100px]",
                                                alwaysEditing
                                                    ? isDirty
                                                        ? "bg-green-600 hover:bg-green-700 text-white shadow-sm border border-green-700/10"
                                                        : "bg-gray-200 text-gray-400 cursor-not-allowed hover:bg-gray-200"
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
                                                    // Reset form data to original
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
