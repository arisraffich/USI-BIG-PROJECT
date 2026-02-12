'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Upload, X, File, Image as ImageIcon, Loader2, Send, BookOpen } from 'lucide-react'
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingStep, setProcessingStep] = useState<string>('')
  const [isCancelled, setIsCancelled] = useState(false)

  // Form data — single step with all fields
  const [formData, setFormData] = useState({
    author_fullname: '',
    author_email: 'arisraffich@gmail.com', // v1: autopopulate for testing
    author_phone: '',
    main_character_name: '',
    number_of_illustrations: 12,
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
    maxSize: 10 * 1024 * 1024,
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
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        setStoryFile(acceptedFiles[0])
      }
    },
  })

  function handleCancel() {
    setIsCancelled(true)
    setIsSubmitting(false)
    setProcessingStep('')
    router.push('/admin/dashboard')
  }

  // Validate required fields (common to both paths)
  function validateCommonFields(): boolean {
    if (!formData.author_fullname.trim()) {
      toast.error('Please enter the author\'s full name')
      return false
    }
    if (!formData.author_email.trim()) {
      toast.error('Please enter the author\'s email')
      return false
    }
    if (!formData.author_phone.trim()) {
      toast.error('Please enter the author\'s phone number')
      return false
    }
    if (!formData.main_character_name.trim()) {
      toast.error('Please enter the main character name')
      return false
    }
    if (!mainCharacterImage) {
      toast.error('Please upload the main character image')
      return false
    }
    if (mainCharacterImage.size > 10 * 1024 * 1024) {
      toast.error('Main character image must be less than 10MB')
      return false
    }
    return true
  }

  // PATH A: Upload Story — admin uploads a manuscript file, AI parses it
  async function handleUploadStory(e: React.MouseEvent) {
    e.preventDefault()
    if (!validateCommonFields()) return
    if (!storyFile) {
      toast.error('Please upload a story file for Path A')
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
      formDataToSend.append('path', 'upload_story') // Signal path A
      formDataToSend.append('author_fullname', formData.author_fullname)
      formDataToSend.append('author_email', formData.author_email)
      formDataToSend.append('author_phone', formData.author_phone)
      formDataToSend.append('main_character_name', formData.main_character_name)
      formDataToSend.append('number_of_illustrations', String(formData.number_of_illustrations))
      formDataToSend.append('main_character_image', mainCharacterImage!)
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
        } catch {
          const text = await response.text()
          errorMessage = text || errorMessage
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()

      if (result.project_id) {
        setProcessingStep('Parsing story (this may take a minute)...')

        // Poll for pages to be created
        let attempts = 0
        const maxAttempts = 90

        while (attempts < maxAttempts) {
          try {
            const statusRes = await fetch(`/api/projects/${result.project_id}`)
            if (statusRes.ok) {
              const statusData = await statusRes.json()
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

  // PATH B: Send to Customer — sends a link to the customer for story text input
  async function handleSendToCustomer(e: React.MouseEvent) {
    e.preventDefault()
    if (!validateCommonFields()) return
    if (formData.number_of_illustrations < 1) {
      toast.error('Number of illustrations must be at least 1')
      return
    }

    setIsSubmitting(true)
    setIsCancelled(false)
    setProcessingStep('Creating project...')

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('path', 'send_to_customer') // Signal path B
      formDataToSend.append('author_fullname', formData.author_fullname)
      formDataToSend.append('author_email', formData.author_email)
      formDataToSend.append('author_phone', formData.author_phone)
      formDataToSend.append('main_character_name', formData.main_character_name)
      formDataToSend.append('number_of_illustrations', String(formData.number_of_illustrations))
      formDataToSend.append('main_character_image', mainCharacterImage!)

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
        } catch {
          const text = await response.text()
          errorMessage = text || errorMessage
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()

      if (result.project_id) {
        setProcessingStep('Sending link to customer...')
        toast.success('Project created! Link sent to customer.')
        setIsSubmitting(false)
        setProcessingStep('')
        window.location.href = `/admin/project/${result.project_id}?tab=pages`
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

  const estimatedMinutes = Math.ceil(formData.number_of_illustrations * 1.5)

  return (
    <div className="max-w-4xl">
      <Dialog open={isSubmitting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Creating Project</DialogTitle>
            <DialogDescription>
              Please wait while we process your request...
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

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            {/* Section 1: Contact Info */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact Info</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="author_fullname">Author&apos;s Full Name *</Label>
                  <Input
                    id="author_fullname"
                    value={formData.author_fullname}
                    onChange={(e) => setFormData({ ...formData, author_fullname: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="author_email">Customer Email *</Label>
                  <Input
                    id="author_email"
                    type="email"
                    value={formData.author_email}
                    onChange={(e) => setFormData({ ...formData, author_email: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, author_phone: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="+1234567890"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Project Info */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Project Info</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="main_character_name">Main Character Name *</Label>
                  <Input
                    id="main_character_name"
                    value={formData.main_character_name}
                    onChange={(e) => setFormData({ ...formData, main_character_name: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="e.g., Luna"
                  />
                </div>
                <div>
                  <Label htmlFor="number_of_illustrations"># of Illustrations *</Label>
                  <Input
                    id="number_of_illustrations"
                    type="number"
                    min={1}
                    max={50}
                    value={formData.number_of_illustrations}
                    onChange={(e) => setFormData({ ...formData, number_of_illustrations: parseInt(e.target.value) || 1 })}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Files */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Files</p>

            {/* Row 3: Main Character Image + Story File side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Main Character Image *</Label>
                <p className="text-xs text-gray-500 mb-2">PNG, JPG, WEBP (max 10MB)</p>
                {mainCharacterImage ? (
                  <div className="relative inline-block">
                    <img
                      src={mainCharacterImage.preview}
                      alt="Main character"
                      className="w-28 h-28 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile('image')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    {...getImageRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isImageDragActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input {...getImageInputProps()} />
                    <ImageIcon className="w-10 h-10 mx-auto text-gray-400 mb-1" />
                    <p className="text-sm text-gray-600">
                      {isImageDragActive ? 'Drop image here' : 'Drag & drop or click'}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label>Story File <span className="text-gray-400 font-normal">(optional)</span></Label>
                <p className="text-xs text-gray-500 mb-2">PDF, DOCX, or TXT (max 10MB)</p>
                {storyFile ? (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                    <File className="w-5 h-5 text-gray-600" />
                    <span className="flex-1 text-sm truncate">{storyFile.name}</span>
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
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isStoryDragActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input {...getStoryInputProps()} />
                    <Upload className="w-10 h-10 mx-auto text-gray-400 mb-1" />
                    <p className="text-sm text-gray-600">
                      {isStoryDragActive ? 'Drop file here' : 'Drag & drop or click'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t space-y-3">
              <p className="text-sm text-gray-500 mb-3">
                Choose how to proceed with this project:
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  onClick={handleUploadStory}
                  disabled={isSubmitting || !storyFile}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Upload Story
                </Button>
                <Button
                  type="button"
                  onClick={handleSendToCustomer}
                  disabled={isSubmitting}
                  variant="outline"
                  className="flex-1 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send to Customer
                </Button>
              </div>
              {!storyFile && (
                <p className="text-xs text-gray-400 text-center">
                  Upload a story file above to enable the &quot;Upload Story&quot; option
                </p>
              )}
              <p className="text-xs text-gray-500 text-center">
                &quot;Send to Customer&quot; will email the author a link to submit their story text.
                <br />
                Estimated time for customer: ~{estimatedMinutes} minutes ({formData.number_of_illustrations} pages)
              </p>
            </div>

            <div className="flex justify-start">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
