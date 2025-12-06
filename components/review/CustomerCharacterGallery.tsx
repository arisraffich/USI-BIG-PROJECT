'use client'

import { Character } from '@/types/character'
import { CustomerCharacterGalleryCard } from './CustomerCharacterGalleryCard'

interface CustomerCharacterGalleryProps {
    characters: Character[]
    mainCharacter?: Character
}

export function CustomerCharacterGallery({ characters, mainCharacter }: CustomerCharacterGalleryProps) {
    // Filter out main character from the list if it's there (to handle duplicates if passed incorrectly)
    const secondaryCharacters = characters.filter(c => !c.is_main)

    // Combine for display: Main first, then Secondary
    const displayList = mainCharacter
        ? [mainCharacter, ...secondaryCharacters]
        : secondaryCharacters

    return (
        <div className="w-full max-w-7xl mx-auto py-8 px-4">
            <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-gray-900 mb-3 font-serif">Character Implementation</h2>
                <p className="text-gray-600 max-w-2xl mx-auto">
                    Here are the generated illustrations for your characters.
                    Please review them. If you need any adjustments, use the "Request Changes" button below the character.
                </p>
            </div>

            <div className="flex flex-wrap justify-center gap-8">
                {displayList.map((char) => (
                    <div key={char.id} className="w-full max-w-[400px] flex-grow-0 flex-shrink-0">
                        <CustomerCharacterGalleryCard
                            character={char}
                            isMain={char.is_main}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
