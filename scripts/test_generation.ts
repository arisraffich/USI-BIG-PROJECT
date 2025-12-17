
import dotenv from 'dotenv'
import { generateIllustration } from '../lib/ai/google-ai'

dotenv.config({ path: '.env.local' })

async function testGen() {
    console.log('Testing Generation...')

    // MOCK DATA based on Hedgehog project
    const characterReferences = [
        { name: "THE MAIN CHARACTER", imageUrl: "https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/character-images/939fec2b-0718-4370-a8a3-5c8dc4c09fa8/main-character.jpg", isMain: true, role: 'Main Character' },
        { name: "Character 2", imageUrl: "https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/character-images/939fec2b-0718-4370-a8a3-5c8dc4c09fa8/characters/Bunny-1.png", isMain: false },
        { name: "Character 3", imageUrl: "https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/character-images/939fec2b-0718-4370-a8a3-5c8dc4c09fa8/characters/Squirrel-1.png", isMain: false },
        { name: "Character 4", imageUrl: "https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/character-images/939fec2b-0718-4370-a8a3-5c8dc4c09fa8/characters/Owl-1.png", isMain: false },
        { name: "Character 5", imageUrl: "https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/character-images/939fec2b-0718-4370-a8a3-5c8dc4c09fa8/characters/Mouse-1.png", isMain: false },
        { name: "Character 6", imageUrl: "https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/character-images/939fec2b-0718-4370-a8a3-5c8dc4c09fa8/characters/Fox-1.png", isMain: false }
    ]

    const prompt = "A cute hedgehog standing in a forest. Vector style."

    try {
        const result = await generateIllustration({
            prompt,
            characterReferences,
            anchorImage: null,
            styleReferenceImages: [],
            aspectRatio: '1:1'
        })

        if (result.success) {
            console.log('SUCCESS!')
        } else {
            console.error('FAILURE:', result.error)
        }
    } catch (e: any) {
        console.error('CRASH:', e.message)
        console.log('Full Error:', e)
    }
}

testGen()
