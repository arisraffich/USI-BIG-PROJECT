'use client'

import { useState, useEffect, memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Save, Edit, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Character } from '@/types/character'



interface CustomerCharacterCardProps {
  character: Character
  isGenerating?: boolean
}

export const CustomerCharacterCard = memo(function CustomerCharacterCard({
  character,
  isGenerating = false
}: CustomerCharacterCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
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
  })

  const hasAnyData = Object.values(formData).some(value => value.trim() !== '')

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
    const hasSavedData = Object.values(savedData).some(value => value.trim() !== '')
    setIsEditing(!hasSavedData)
  }, [character.id])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleTextareaChange = (value: string) => {
    setFormData(prev => ({ ...prev, clothing_and_accessories: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/review/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: formData.age || null,
          gender: formData.gender || null,
          skin_color: formData.skin_color || null,
          hair_color: formData.hair_color || null,
          hair_style: formData.hair_style || null,
          eye_color: formData.eye_color || null,
          clothing: formData.clothing_and_accessories || null,
          accessories: null,
          special_features: null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save character')
      }

      toast.success('Character saved successfully')
      setIsEditing(false)
    } catch (error) {
      toast.error('Failed to save character')
    } finally {
      setSaving(false)
    }
  }

  const displayName = character.name || character.role || (character.is_main ? 'Main Character' : 'Unnamed Character')
  const isMainCharacter = character.is_main
  const hasImage = !!character.image_url
  const showLoadingState = isGenerating && !hasImage

  // After generation, display like main character (read-only)
  if (hasImage && !isMainCharacter) {
    return (
      <Card id={`character-${character.id}`} className="hover:shadow-lg transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start gap-6 mb-4">
            <div className="flex-1 space-y-5">
              {character.age && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Age</span>
                  <span className="block text-sm text-gray-700">{character.age}</span>
                </div>
              )}
              {character.gender && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Gender</span>
                  <span className="block text-sm text-gray-700">{character.gender}</span>
                </div>
              )}
              {character.skin_color && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Skin Color</span>
                  <span className="block text-sm text-gray-700">{character.skin_color}</span>
                </div>
              )}
              {character.hair_color && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Hair Color</span>
                  <span className="block text-sm text-gray-700">{character.hair_color}</span>
                </div>
              )}
              {character.hair_style && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Hair Style</span>
                  <span className="block text-sm text-gray-700">{character.hair_style}</span>
                </div>
              )}
              {character.eye_color && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Eye Color</span>
                  <span className="block text-sm text-gray-700">{character.eye_color}</span>
                </div>
              )}
              {character.clothing && (
                <div className="space-y-1">
                  <span className="block text-sm font-semibold text-gray-900">Clothing and Accessories</span>
                  <span className="block text-sm text-gray-700 whitespace-pre-wrap">
                    {character.clothing}
                  </span>
                </div>
              )}
              {!character.age && !character.gender && !character.skin_color && !character.hair_color && !character.hair_style && !character.eye_color && !character.clothing && (
                <p className="text-sm text-gray-500 italic">
                  No character details available.
                </p>
              )}
            </div>
            <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0 -ml-[200px]">
              <div className="text-center">
                <h3 className="font-semibold text-lg">{displayName}</h3>
                {character.story_role && (
                  <p className="text-sm text-gray-600 mt-1">{character.story_role}</p>
                )}
              </div>
              {character.image_url && (
                <img
                  src={character.image_url}
                  alt={displayName}
                  className="w-32 h-32 object-cover rounded-lg border flex-shrink-0"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Main character or character without image (editable)
  return (
    <Card id={`character-${character.id}`} className="hover:shadow-lg transition-shadow relative">
      <CardContent className="pt-6">
        {isMainCharacter ? (
          <>
            <div className="flex items-start gap-6 mb-4">
              <div className="flex-1 space-y-5">
                {character.age && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Age</span>
                    <span className="block text-sm text-gray-700">{character.age}</span>
                  </div>
                )}
                {character.gender && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Gender</span>
                    <span className="block text-sm text-gray-700">{character.gender}</span>
                  </div>
                )}
                {character.skin_color && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Skin Color</span>
                    <span className="block text-sm text-gray-700">{character.skin_color}</span>
                  </div>
                )}
                {character.hair_color && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Hair Color</span>
                    <span className="block text-sm text-gray-700">{character.hair_color}</span>
                  </div>
                )}
                {character.hair_style && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Hair Style</span>
                    <span className="block text-sm text-gray-700">{character.hair_style}</span>
                  </div>
                )}
                {character.eye_color && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Eye Color</span>
                    <span className="block text-sm text-gray-700">{character.eye_color}</span>
                  </div>
                )}
                {character.clothing && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">Clothing and Accessories</span>
                    <span className="block text-sm text-gray-700 whitespace-pre-wrap">
                      {character.clothing}
                    </span>
                  </div>
                )}
                {!character.age && !character.gender && !character.skin_color && !character.hair_color && !character.hair_style && !character.eye_color && !character.clothing && (
                  <p className="text-sm text-gray-500 italic">
                    No character details available. Character form may not have been processed yet.
                  </p>
                )}
              </div>
              <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0 -ml-[200px]">
                <div className="text-center">
                  <h3 className="font-semibold text-lg">{displayName}</h3>
                  {character.story_role && (
                    <p className="text-sm text-gray-600 mt-1">{character.story_role}</p>
                  )}
                </div>
                {character.image_url && (
                  <img
                    src={character.image_url}
                    alt={displayName}
                    className="w-32 h-32 object-cover rounded-lg border flex-shrink-0"
                  />
                )}
                <p className="text-sm text-gray-500">Main Character</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              {showLoadingState ? (
                <div className="w-20 h-20 rounded-lg border flex-shrink-0 flex items-center justify-center bg-gray-100">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : character.image_url ? (
                <img
                  src={character.image_url}
                  alt={displayName}
                  className="w-20 h-20 object-cover rounded-lg border flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg border flex-shrink-0 flex items-center justify-center bg-gray-100">
                  <User className="w-8 h-8 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg mb-2">{displayName}</h3>
                {character.story_role && (
                  <p className="text-sm text-gray-600 mb-2">{character.story_role}</p>
                )}
              </div>
            </div>
            <div className="space-y-5 mb-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-7">
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Age</label>
                  {isEditing ? (
                    <Input
                      value={formData.age}
                      onChange={(e) => handleInputChange('age', e.target.value)}
                      placeholder="Enter age..."
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="min-h-[2.25rem] flex items-center">
                      <p className="text-sm text-gray-700">
                        {formData.age || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Gender</label>
                  {isEditing ? (
                    <Input
                      value={formData.gender}
                      onChange={(e) => handleInputChange('gender', e.target.value)}
                      placeholder="Enter gender..."
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="min-h-[2.25rem] flex items-center">
                      <p className="text-sm text-gray-700">
                        {formData.gender || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Eye Color</label>
                  {isEditing ? (
                    <Input
                      value={formData.eye_color}
                      onChange={(e) => handleInputChange('eye_color', e.target.value)}
                      placeholder="Enter eye color..."
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="min-h-[2.25rem] flex items-center">
                      <p className="text-sm text-gray-700">
                        {formData.eye_color || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Skin Color</label>
                  {isEditing ? (
                    <Input
                      value={formData.skin_color}
                      onChange={(e) => handleInputChange('skin_color', e.target.value)}
                      placeholder="Enter skin color..."
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="min-h-[2.25rem] flex items-center">
                      <p className="text-sm text-gray-700">
                        {formData.skin_color || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Hair Color</label>
                  {isEditing ? (
                    <Input
                      value={formData.hair_color}
                      onChange={(e) => handleInputChange('hair_color', e.target.value)}
                      placeholder="Enter hair color..."
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="min-h-[2.25rem] flex items-center">
                      <p className="text-sm text-gray-700">
                        {formData.hair_color || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Hair Style</label>
                  {isEditing ? (
                    <Input
                      value={formData.hair_style}
                      onChange={(e) => handleInputChange('hair_style', e.target.value)}
                      placeholder="Enter hair style..."
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="min-h-[2.25rem] flex items-center">
                      <p className="text-sm text-gray-700">
                        {formData.hair_style || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="block text-sm font-semibold text-gray-900">Clothing and Accessories</label>
                  {isEditing ? (
                    <Textarea
                      value={formData.clothing_and_accessories}
                      onChange={(e) => handleTextareaChange(e.target.value)}
                      placeholder="Enter clothing, accessories, and special features..."
                      rows={4}
                      className="text-sm resize-none"
                    />
                  ) : (
                    <div className="min-h-[6rem] py-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {formData.clothing_and_accessories || <span className="text-gray-400 italic">Not specified</span>}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-2 pt-2 pb-4">
              {isEditing ? (
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasAnyData}
                  size="sm"
                  className={`min-w-[100px] ${saving || !hasAnyData ? 'bg-gray-400 hover:bg-gray-400 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  size="sm"
                  className="min-w-[100px]"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})






