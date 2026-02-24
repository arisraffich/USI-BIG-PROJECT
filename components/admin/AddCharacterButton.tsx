'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Loader2, Sparkles, UserPlus, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { getErrorMessage } from '@/lib/utils/error'

interface Suggestion {
  name: string | null
  role: string | null
  story_role: string | null
  appears_in: string[]
}

interface AddCharacterButtonProps {
  mainCharacterName: string | null
  projectId?: string
  mode?: 'button' | 'card'
  className?: string
  triggerRef?: React.RefObject<HTMLButtonElement>
  forceShow?: boolean
  onCharacterAdded?: () => void
}

export function AddCharacterButton({ mainCharacterName, projectId: propProjectId, mode = 'button', className, triggerRef, forceShow, onCharacterAdded }: AddCharacterButtonProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState<string | null>(propProjectId || null)
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Suggestions state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)

  // Form state
  const [isManualMode, setIsManualMode] = useState(false)
  const [nameRole, setNameRole] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (propProjectId) {
      setProjectId(propProjectId)
    } else {
      const match = pathname?.match(/\/admin\/project\/([^\/]+)/)
      setProjectId(match ? match[1] : null)
    }
  }, [pathname, propProjectId])

  const isCharactersActive = searchParams?.get('tab') === 'characters'

  const nameRolePlaceholder = mainCharacterName
    ? `e.g., Mom, ${mainCharacterName}'s mother, or Character Name`
    : 'e.g., Mom, Character Name, or Role'
  const descriptionPlaceholder = mainCharacterName
    ? `${mainCharacterName}'s mother, who narrates the story.`
    : "The main character's mother, who narrates the story."

  async function fetchSuggestions() {
    if (!projectId) return
    setIsLoadingSuggestions(true)
    setSuggestionsLoaded(false)
    try {
      const res = await fetch('/api/characters/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err)
    } finally {
      setIsLoadingSuggestions(false)
      setSuggestionsLoaded(true)
    }
  }

  function handleOpen() {
    setIsOpen(true)
    setSelectedSuggestion(null)
    setIsManualMode(false)
    setNameRole('')
    setDescription('')
    setSuggestions([])
    setSuggestionsLoaded(false)
    fetchSuggestions()
  }

  function handleSelectSuggestion(s: Suggestion) {
    setSelectedSuggestion(s)
    setNameRole(s.name || s.role || '')
    setDescription(s.story_role || '')
    setIsManualMode(false)
  }

  function handleManualMode() {
    setSelectedSuggestion(null)
    setIsManualMode(true)
    setNameRole('')
    setDescription('')
  }

  function handleCancel() {
    setIsOpen(false)
    setSelectedSuggestion(null)
    setIsManualMode(false)
    setNameRole('')
    setDescription('')
  }

  async function handleCreate() {
    if (!projectId || !nameRole.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: nameRole.trim(),
          role: nameRole.trim(),
          story_role: description.trim() || null,
          appears_in: selectedSuggestion?.appears_in || [],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create character')
      }

      const newCharacter = await response.json()
      const characterId = newCharacter.id

      const pagesInfo = selectedSuggestion?.appears_in?.length
        ? ` (pages ${selectedSuggestion.appears_in.join(', ')})`
        : ''
      toast.success(`Character "${nameRole.trim()}" added${pagesInfo}`)
      setIsOpen(false)
      setNameRole('')
      setDescription('')
      setSelectedSuggestion(null)
      setIsManualMode(false)

      if (onCharacterAdded) {
        onCharacterAdded()
      }

      if (!isCharactersActive && forceShow && pathname) {
        const params = new URLSearchParams(searchParams?.toString() || '')
        params.set('tab', 'characters')
        router.replace(`${pathname}?${params.toString()}`)
      }

      router.refresh()

      setTimeout(() => {
        const el = document.getElementById(`character-${characterId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2')
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000)
        }
      }, 500)
    } catch (error: unknown) {
      toast.error('Failed to add character', {
        description: getErrorMessage(error, 'An error occurred'),
      })
    } finally {
      setIsCreating(false)
    }
  }

  if ((!isCharactersActive && !forceShow) || !projectId) return null

  const dialogContent = (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Add New Character
        </DialogTitle>
        <DialogDescription>
          Select a suggested character from the story or add one manually.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* AI Suggestions Section */}
        {isLoadingSuggestions && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500">Analyzing story for missing characters...</p>
          </div>
        )}

        {suggestionsLoaded && !isLoadingSuggestions && (
          <>
            {suggestions.length > 0 && !isManualMode && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Suggested from story
                </Label>
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {suggestions.map((s, i) => {
                    const isSelected = selectedSuggestion === s
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectSuggestion(s)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{s.name || s.role}</p>
                            {s.story_role && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.story_role}</p>
                            )}
                          </div>
                          {s.appears_in?.length > 0 && (
                            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              <BookOpen className="w-3 h-3" />
                              {s.appears_in.length === 1
                                ? `p.${s.appears_in[0]}`
                                : `p.${s.appears_in[0]}-${s.appears_in[s.appears_in.length - 1]}`}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {suggestions.length === 0 && !isManualMode && (
              <div className="text-center py-6 text-sm text-gray-500">
                <p className="font-medium">No missing characters found in the story.</p>
                <p className="mt-1">You can still add one manually below.</p>
              </div>
            )}
          </>
        )}

        {/* Manual / Edit section */}
        {(isManualMode || selectedSuggestion || (suggestionsLoaded && suggestions.length === 0)) && (
          <div className="space-y-3 pt-1">
            {isManualMode && (
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Manual entry
              </Label>
            )}
            <div className="space-y-2">
              <Label htmlFor="char-name" className="text-sm font-medium">Name / Role</Label>
              <Input
                id="char-name"
                placeholder={nameRolePlaceholder}
                value={nameRole}
                onChange={(e) => setNameRole(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="char-desc" className="text-sm font-medium">Description</Label>
              <Textarea
                id="char-desc"
                placeholder={descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isCreating}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Switch to manual mode */}
        {suggestionsLoaded && suggestions.length > 0 && !isManualMode && (
          <button
            onClick={handleManualMode}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            + Add manually instead
          </button>
        )}

        {/* Switch back to suggestions */}
        {isManualMode && suggestions.length > 0 && (
          <button
            onClick={() => { setIsManualMode(false); setSelectedSuggestion(null); setNameRole(''); setDescription('') }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            ← Back to suggestions
          </button>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={isCreating || !nameRole.trim() || isLoadingSuggestions}
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Character'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )

  if (mode === 'card') {
    return (
      <>
        <div
          onClick={handleOpen}
          className="cursor-pointer group flex flex-col items-center justify-center gap-4 p-8 min-h-[300px] h-full rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-300"
        >
          <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Plus className="w-7 h-7 text-gray-400 group-hover:text-blue-500" />
          </div>
          <div className="text-center space-y-1">
            <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Add New Character</h4>
            <p className="text-sm text-gray-500 max-w-[200px]">AI-suggested or manual entry</p>
          </div>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          {dialogContent}
        </Dialog>
      </>
    )
  }

  return (
    <>
      <Button
        ref={triggerRef}
        onClick={handleOpen}
        className={className || "flex items-center gap-2 m-[15px] h-[47px] px-[calc(1rem+15px)]"}
      >
        <Plus className="w-4 h-4" />
        Add Character
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {dialogContent}
      </Dialog>
    </>
  )
}
