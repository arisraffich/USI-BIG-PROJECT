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
                <h2 className="text-3xl font-bold text-gray-900 mb-3 font-serif">Character Design</h2>
                <p className="text-gray-600 max-w-2xl mx-auto">
                    Here are the illustrations for your book's characters. Please review them. If you need any adjustments, click the <span className="text-blue-600 font-semibold">"Request Edits"</span> button to add your change requests.
                </p>
            </div>

            {/* Flexbox layout: Centered cards, max 3 pairs per row */}
            <div className="flex flex-wrap justify-center gap-6">
                {displayList.map((char) => (
                    <div key={char.id} className="w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
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
