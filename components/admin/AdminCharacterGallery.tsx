'use client'

import { Character } from '@/types/character'
import { AdminCharacterGalleryCard } from './AdminCharacterGalleryCard'

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
            <div className="flex flex-wrap justify-center gap-6">
                {sortedCharacters.map((character) => (
                    <div key={character.id} className="w-full max-w-[220px]">
                        <AdminCharacterGalleryCard
                            character={character}
                            projectId={projectId}
                            isGenerating={isGenerating}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
