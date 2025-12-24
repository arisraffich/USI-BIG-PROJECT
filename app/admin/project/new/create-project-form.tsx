'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Upload, X, File, Image as ImageIcon, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface FileWithPreview extends File {
  preview?: string
}

export default function CreateProjectForm() {
  const router = useRouter()
  const [step, setStep] = useState<'info' | 'files'>('info')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingStep, setProcessingStep] = useState<string>('')
  const [isCancelled, setIsCancelled] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    book_title: '',
    author_fullname: '',
    author_email: '',
    author_phone: '',
  })

  // File uploads
  const [mainCharacterImage, setMainCharacterImage] = useState<FileWithPreview | null>(null)
  const [storyFile, setStoryFile] = useState<File | null>(null)

  // Dropzone for main character image
  const {
    getRootProps: getImageRootProps,
    getInputProps: getImageInputProps,
    isDragActive: isImageDragActive,
  } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        const file = Object.assign(acceptedFiles[0], {
          preview: URL.createObjectURL(acceptedFiles[0]),
        })
        setMainCharacterImage(file)
      }
    },
  })

  // Dropzone for story file
  const {
    getRootProps: getStoryRootProps,
    getInputProps: getStoryInputProps,
    isDragActive: isStoryDragActive,
  } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        setStoryFile(acceptedFiles[0])
      }
    },
  })

  function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStep('files')
  }

  function handleCancel() {
    setIsCancelled(true)
    setIsSubmitting(false)
    setProcessingStep('')
    router.push('/admin/dashboard')
  }

  async function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate files
    if (!mainCharacterImage || !storyFile) {
      toast.error('Please upload all required files')
      return
    }

    // Validate file sizes
    if (mainCharacterImage.size > 10 * 1024 * 1024) {
      toast.error('Main character image must be less than 10MB')
      return
    }
    if (storyFile.size > 10 * 1024 * 1024) {
      toast.error('Story file must be less than 10MB')
      return
    }

    setIsSubmitting(true)
    setIsCancelled(false)
    setProcessingStep('Uploading files...')

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('book_title', formData.book_title)
      formDataToSend.append('author_fullname', formData.author_fullname)
      formDataToSend.append('author_email', formData.author_email)
      formDataToSend.append('author_phone', formData.author_phone)
      formDataToSend.append('main_character_image', mainCharacterImage)
      formDataToSend.append('story_file', storyFile)

      setProcessingStep('Creating project and uploading files...')
      const response = await fetch('/api/projects', {
        method: 'POST',
        body: formDataToSend,
      })

      if (isCancelled) {
        setIsSubmitting(false)
        setProcessingStep('')
        return
      }

      if (!response.ok) {
        let errorMessage = 'Failed to create project'
        try {
          const error = await response.json()
          errorMessage = error.error || error.details || errorMessage
          console.error('API Error Response:', error)
        } catch (parseError) {
          const text = await response.text()
          errorMessage = text || errorMessage
          console.error('API Error (non-JSON):', text)
        }
        throw new Error(errorMessage)
      }

      let result
      try {
        result = await response.json()
        console.log('API Success Response:', result)
      } catch (parseError) {
        console.error('Failed to parse API response:', parseError)
        throw new Error('Invalid response from server')
      }

      // Check if we have a project_id (success) or error
      if (result.project_id) {
        setProcessingStep('Parsing story (this may take a minute)...')

        // Poll for pages to be created (signals story parsing is done)
        let attempts = 0
        const maxAttempts = 60 // 60 seconds

        while (attempts < maxAttempts) {
          try {
            const statusRes = await fetch(`/api/projects/${result.project_id}`)
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              // If we have pages, or if status moved past 'draft' (meaning parsing failed but other things proceeded?), proceed.
              // Actually, simply checking pages_count > 0 is safest for "Story Parsed".
              if (statusData.pages_count > 0) {
                break
              }
            }
          } catch (e) {
            console.error('Polling error', e)
          }

          attempts++
          await new Promise(r => setTimeout(r, 1000))
        }

        setProcessingStep('Project ready! Redirecting...')
        toast.success('Project created successfully!')
        setIsSubmitting(false)
        setProcessingStep('')

        // Redirect to the newly created project page - CHARACTERS TAB
        window.location.href = `/admin/project/${result.project_id}?tab=characters`
      } else if (result.error) {
        throw new Error(result.error || result.details || 'Failed to create project')
      } else {
        throw new Error('Unexpected response format from server')
      }
    } catch (error) {
      if (!isCancelled) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create project'
        console.error('Project creation error:', error)
        toast.error(errorMessage)
      }
      setIsSubmitting(false)
      setProcessingStep('')
    }
  }

  function removeFile(type: 'image' | 'story') {
    if (type === 'image') {
      if (mainCharacterImage?.preview) {
        URL.revokeObjectURL(mainCharacterImage.preview)
      }
      setMainCharacterImage(null)
    } else {
      setStoryFile(null)
    }
  }

  return (
    <div className="max-w-4xl">
      <Dialog open={isSubmitting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Creating Project</DialogTitle>
            <DialogDescription>
              Please wait while we process your files...
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              {processingStep ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-700">{processingStep}</span>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="w-full"
            >
              Cancel and Go to Dashboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {step === 'info' ? (
        <Card>
          <CardHeader>
            <CardTitle>Project Information</CardTitle>
            <CardDescription>Enter the book and author details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInfoSubmit} className="space-y-6">
              <div>
                <Label htmlFor="book_title">Book Title *</Label>
                <Input
                  id="book_title"
                  value={formData.book_title}
                  onChange={(e) =>
                    setFormData({ ...formData, book_title: e.target.value })
                  }
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="author_fullname">Author Full Name *</Label>
                <Input
                  id="author_fullname"
                  value={formData.author_fullname}
                  onChange={(e) =>
                    setFormData({ ...formData, author_fullname: e.target.value })
                  }
                  required
                  className="mt-1"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <Label htmlFor="author_email">Author Email *</Label>
                <Input
                  id="author_email"
                  type="email"
                  value={formData.author_email}
                  onChange={(e) =>
                    setFormData({ ...formData, author_email: e.target.value })
                  }
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="author_phone">Author Phone *</Label>
                <Input
                  id="author_phone"
                  type="tel"
                  value={formData.author_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, author_phone: e.target.value })
                  }
                  required
                  className="mt-1"
                  placeholder="+1234567890"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button type="submit">Next: Upload Files</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upload Files</CardTitle>
            <CardDescription>
              Upload the required files for this project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFinalSubmit} className="space-y-6">
              {/* Main Character Image */}
              <div>
                <Label>Main Character Image *</Label>
                <p className="text-sm text-gray-600 mb-2">
                  PNG, JPG, WEBP (max 10MB)
                </p>
                {mainCharacterImage ? (
                  <div className="relative inline-block">
                    <img
                      src={mainCharacterImage.preview}
                      alt="Main character"
                      className="w-32 h-32 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile('image')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    {...getImageRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isImageDragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                      }`}
                  >
                    <input {...getImageInputProps()} />
                    <ImageIcon className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">
                      {isImageDragActive
                        ? 'Drop the image here'
                        : 'Drag & drop or click to select'}
                    </p>
                  </div>
                )}
              </div>

              {/* Story File */}
              <div>
                <Label>Story File *</Label>
                <p className="text-sm text-gray-600 mb-2">
                  PDF, DOCX, or TXT (max 10MB)
                </p>
                {storyFile ? (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                    <File className="w-5 h-5 text-gray-600" />
                    <span className="flex-1 text-sm">{storyFile.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile('story')}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    {...getStoryRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isStoryDragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                      }`}
                  >
                    <input {...getStoryInputProps()} />
                    <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">
                      {isStoryDragActive
                        ? 'Drop the file here'
                        : 'Drag & drop or click to select'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('info')}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating Project...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

