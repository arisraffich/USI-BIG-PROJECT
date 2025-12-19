'use client'

import { Character } from '@/types/character'
import { UnifiedCharacterCard } from './UnifiedCharacterCard'

interface AdminCharacterGalleryProps {
    characters: Character[]
    projectId: string
    isGenerating?: boolean
}

export function AdminCharacterGallery({ characters, projectId, isGenerating = false }: AdminCharacterGalleryProps) {
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
        <div className="container mx-auto max-w-7xl">
            {/* 6-column grid: Each UnifiedCharacterCard spans 2 columns = 3 pairs per row on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                {sortedCharacters.map((character) => (
                    <UnifiedCharacterCard
                        key={character.id}
                        character={character}
                        projectId={projectId}
                        isGenerating={isGenerating}
                    />
                ))}
            </div>
        </div>
    )
}
