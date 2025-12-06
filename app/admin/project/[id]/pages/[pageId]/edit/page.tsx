'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'

interface Page {
  id: string
  page_number: number
  story_text: string
  scene_description: string | null
  description_auto_generated: boolean
}

export default function EditPagePage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>
}) {
  const router = useRouter()
  const [resolvedParams, setResolvedParams] = useState<{ id: string; pageId: string } | null>(null)
  const [projectId, setProjectId] = useState<string>('')
  const [pageId, setPageId] = useState<string>('')
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [storyText, setStoryText] = useState('')
  const [sceneDescription, setSceneDescription] = useState('')

  useEffect(() => {
    async function resolveParams() {
      const resolved = await params
      setResolvedParams(resolved)
      setProjectId(resolved.id)
      setPageId(resolved.pageId)
    }
    resolveParams()
  }, [params])

  useEffect(() => {
    if (!pageId) return

    async function fetchPage() {
      try {
        const response = await fetch(`/api/pages/${pageId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch page')
        }
        const data = await response.json()
        setPage(data)
        setStoryText(data.story_text || '')
        setSceneDescription(data.scene_description || '')
      } catch (error) {
        toast.error('Failed to load page')
        if (projectId) {
          router.push(`/admin/project/${projectId}/pages`)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchPage()
  }, [pageId, projectId, router])

  async function handleSave() {
    if (!pageId || !page) return

    setSaving(true)
    try {
      const response = await fetch(`/api/pages/${pageId}`, {
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
      if (projectId) {
        router.push(`/admin/project/${projectId}/pages`)
      }
    } catch (error) {
      toast.error('Failed to save page')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !pageId) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-gray-500">Page not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        {projectId && (
          <Link
            href={`/admin/project/${projectId}/pages`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Pages
          </Link>
        )}
        <h1 className="text-3xl font-bold text-gray-900">Edit Page {page.page_number}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Page Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="story_text" className="text-base font-semibold mb-2 block">
              Story Text
            </Label>
            <Textarea
              id="story_text"
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              rows={8}
              className="font-serif"
              placeholder="Enter the story text for this page..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="scene_description" className="text-base font-semibold">
                Scene Description
              </Label>
              {page.description_auto_generated && (
                <span className="text-xs text-orange-600">Auto-generated</span>
              )}
            </div>
            <Textarea
              id="scene_description"
              value={sceneDescription}
              onChange={(e) => setSceneDescription(e.target.value)}
              rows={6}
              placeholder="Enter the scene description for this page..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            {projectId && (
              <Link href={`/admin/project/${projectId}/pages`}>
                <Button variant="outline">Cancel</Button>
              </Link>
            )}
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

