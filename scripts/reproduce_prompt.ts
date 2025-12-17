
import path from 'path'
import dotenv from 'dotenv'

console.log('CWD:', process.cwd())
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// MOCKED DATA (Simulation of what is in the DB)
async function analyze() {
    console.log('--- ANALYZING PROMPT CONSTRUCTION ---')

    // SIMULATED DB DATA
    const page = {
        scene_description: "A cute **hedgehog** standing in a lush green forest, offering a cup of tea to an Owl.",
        background_elements: "Forest trees, soft lighting.",
        character_actions: {}
    }

    const characters = [
        { name: "Hedgehog", is_main: true },
        { name: "Owl", is_main: false }
    ]

    console.log('\n--- RAW DATA FROM DB ---')
    console.log('Scene Description:', page.scene_description)
    console.log('Characters:', characters.map(c => c.name).join(', '))

    // 4. Simulate our "Semantic Override" Logic
    let fullPrompt = `Scene Description:
${page.scene_description || 'A scene from the story.'}

Character Instructions:
No specific actions.

Background Instructions:
${page.background_elements || 'Appropriate background.'}`

    console.log('\n--- WHAT THE AI SEES (THE LEAK) ---')
    console.log(fullPrompt)

    // 5. Check for Leaks
    const leakFound = fullPrompt.toLowerCase().includes('hedgehog')
    if (leakFound) {
        console.log('\n🚨 CRITICAL LEAK FOUND: The word "hedgehog" is present in the text prompt!')
        console.log('This confirms that the AI is being told to draw a "hedgehog" (generic concept) rather than just "THE MAIN CHARACTER" (visual reference).')
    } else {
        console.log('\nNo "hedgehog" leak found in text. The issue might be purely style-based.')
    }
}

analyze()
