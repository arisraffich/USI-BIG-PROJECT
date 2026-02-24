'use client'

import { Character } from '@/types/character'
import { UnifiedCharacterCard } from './UnifiedCharacterCard'
import { NewCharacterFormCard } from './NewCharacterFormCard'
import { AddCharacterButton } from './AddCharacterButton'

interface AdminCharacterGalleryProps {
    characters: Character[]
    projectId: string
    isGenerating?: boolean
    isSketchPhase?: boolean
}

export function AdminCharacterGallery({ characters, projectId, isGenerating = false, isSketchPhase = false }: AdminCharacterGalleryProps) {
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

    const mainChar = sortedCharacters.find(c => c.is_main)

    const isNewCharacter = (c: Character) =>
        !c.is_main && !c.image_url && !c.generation_error

    return (
        <div className="container mx-auto max-w-[1600px] px-4">
            <div className="flex flex-wrap justify-center gap-6">
                {sortedCharacters.map((character) => (
                    <div key={character.id} className="w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
                        {isNewCharacter(character) && !isGenerating ? (
                            <NewCharacterFormCard
                                character={character}
                                projectId={projectId}
                            />
                        ) : (
                            <UnifiedCharacterCard
                                character={character}
                                projectId={projectId}
                                isGenerating={isGenerating}
                                isSketchPhase={isSketchPhase}
                            />
                        )}
                    </div>
                ))}
                <div className="w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
                    <AddCharacterButton
                        mode="card"
                        projectId={projectId}
                        mainCharacterName={mainChar?.name || mainChar?.role || null}
                        forceShow
                    />
                </div>
            </div>
        </div>
    )
}
