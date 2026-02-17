'use client'

import { Character } from '@/types/character'
import { UnifiedCharacterCard } from './UnifiedCharacterCard'

interface AdminCharacterGalleryProps {
    characters: Character[]
    projectId: string
    isGenerating?: boolean
    isSketchPhase?: boolean
}

export function AdminCharacterGallery({ characters, projectId, isGenerating = false, isSketchPhase = false }: AdminCharacterGalleryProps) {
    // Sort: Main first, then by creation date
    const sortedCharacters = [...characters].sort((a, b) => {
        if (a.is_main && !b.is_main) return -1
        if (!a.is_main && b.is_main) return 1
        if (!a.is_main && !b.is_main) {
            const timeDiff = new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
            if (timeDiff !== 0) return timeDiff
            return a.id.localeCompare(b.id)
        }
        return 0
    })

    return (
        <div className="container mx-auto max-w-[1600px] px-4">
            {/* Flexbox layout: Centered cards, max 3 pairs per row (6 images total) */}
            <div className="flex flex-wrap justify-center gap-6">
                {sortedCharacters.map((character) => (
                    <div key={character.id} className="w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
                        <UnifiedCharacterCard
                            character={character}
                            projectId={projectId}
                            isGenerating={isGenerating}
                            isSketchPhase={isSketchPhase}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
