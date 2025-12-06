'use client'

import { useState, memo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, X } from 'lucide-react'
import { toast } from 'sonner'

interface Page {
  id: string
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
}

interface PageCardProps {
  page: Page
}

export const PageCard = memo(function PageCard({ page }: PageCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [storyText, setStoryText] = useState(page.story_text || '')
  const [sceneDescription, setSceneDescription] = useState(page.scene_description || '')
  const [saving, setSaving] = useState(false)

  const handleEdit = () => {
    setIsEditing(true)
    setStoryText(page.story_text || '')
    setSceneDescription(page.scene_description || '')
  }

  const handleCancel = () => {
    setIsEditing(false)
    setStoryText(page.story_text || '')
    setSceneDescription(page.scene_description || '')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_text: storyText,
          scene_description: sceneDescription,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save page')
      }

      toast.success('Page saved successfully')
      setIsEditing(false)
      router.refresh()
    } catch (error) {
      toast.error('Failed to save page')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-semibold text-lg">Page {page.page_number}</h3>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="border rounded-md px-4 pt-1 pb-4 bg-gray-50 space-y-4 mb-8">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Story Text:</p>
              <Textarea
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                className="text-sm min-h-[200px]"
                placeholder="Enter story text..."
              />
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Scene Description:</p>
              <Textarea
                value={sceneDescription}
                onChange={(e) => setSceneDescription(e.target.value)}
                className="text-sm min-h-[200px]"
                placeholder="Enter scene description..."
              />
            </div>
          </div>
        ) : (
          <div className="h-64 overflow-y-auto border rounded-md px-4 pt-1 pb-4 bg-gray-50 mb-8">
            {page.story_text && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Story Text:</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {page.story_text}
                </p>
              </div>
            )}
            {page.scene_description && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Scene Description:
                  {page.description_auto_generated && (
                    <span className="ml-2 text-xs text-orange-600 font-normal">(Edited)</span>
                  )}
                </p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {page.scene_description}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
