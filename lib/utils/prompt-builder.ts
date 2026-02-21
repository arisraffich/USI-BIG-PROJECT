import { Character } from '@/types/character'
import { Page } from '@/types/page'
import { Project } from '@/types/project'

export function buildCharacterPrompt(character: Character, hasReferenceImage: boolean = false, hasVisualReference: boolean = false): string {
  // Helper to build the character description details
  const details: string[] = []

  // Core physical traits
  if (character.eye_color) details.push(`Eye color: ${character.eye_color}`)
  if (character.hair_color) details.push(`Hair color: ${character.hair_color}`)
  if (character.hair_style) details.push(`Hair Style: ${character.hair_style}`)
  if (character.age) details.push(`Age: ${character.age}`)
  if (character.gender) details.push(`Gender: ${character.gender}`)
  if (character.skin_color) details.push(`Skin color: ${character.skin_color}`)

  // Visuals (Clothing, Accessories, Features)
  const visualRefs: string[] = []
  if (character.clothing && character.clothing !== 'N/A') visualRefs.push(`Wears ${character.clothing}`)
  if (character.accessories && character.accessories !== 'N/A') visualRefs.push(`with ${character.accessories}`)
  if (character.special_features && character.special_features !== 'N/A') visualRefs.push(character.special_features)

  if (visualRefs.length > 0) {
    details.push(`Additional visual references: ${visualRefs.join(', ')}`)
  }

  const nameRef = character.name || character.role || 'Character'

  // SCENARIO 1: Style Reference is available (Secondary Characters)
  if (hasReferenceImage) {
    const hasTextTraits = details.length > 0

    let physicalLine: string
    if (hasVisualReference && !hasTextTraits) {
      physicalLine = 'Use the appearance reference photo for all physical traits.'
    } else if (hasVisualReference && hasTextTraits) {
      physicalLine = `Base appearance on the reference photo. Apply these overrides: ${details.join(', ')}`
    } else {
      physicalLine = `Physical traits: ${details.join(', ') || 'As described'}`
    }

    return `TARGET CHARACTER: ${nameRef}
${physicalLine}

OUTPUT REQUIREMENTS:
- Full-body children's book character illustration
- Show character from head to toes
- Standing on clean, plain white background
- No scenery, no additional objects, no background colors
- Must feel like it belongs in the same book series, drawn by the same artist`
  }

  // SCENARIO 2: No Reference (Main Character / First Gen)
  // Use the original prompt strategy but cleaner
  const parts: string[] = []

  if (character.age) parts.push(`${character.age} year old`)
  if (character.gender && character.gender !== 'N/A') parts.push(character.gender)
  parts.push(nameRef) // "named Zara" or "Main Character"

  // Reuse the details we already parsed, but flatten them for the comma-separated list
  // (We skip the first few that are already handled or need specific phrasing)
  if (character.ethnicity && character.ethnicity !== 'N/A') parts.push(`${character.ethnicity} ethnicity`)
  if (character.hair_color && character.hair_color !== 'N/A') parts.push(`${character.hair_color} hair`)
  if (character.eye_color && character.eye_color !== 'N/A') parts.push(`${character.eye_color} eyes`)
  if (character.clothing && character.clothing !== 'N/A') parts.push(`wearing ${character.clothing}`)

  const basePrompt = parts.join(', ')

  return `${basePrompt}, children's book character illustration, COLORED, hand-drawn style, warm and inviting, NOT photorealistic, NOT digital art looking, professional children's book quality`
}

export function buildSketchPrompt(
  page: Page,
  characters: Character[],
  project: Project
): string {
  let prompt = page.scene_description || ''

  // Add character descriptions
  if (characters.length > 0) {
    const charDescriptions = characters
      .map((c) => c.name || c.role)
      .join(', ')
    prompt += `. Characters in scene: ${charDescriptions}`
  }

  // Add text integration if applicable
  if (project.text_integration === 'integrated') {
    prompt += `. Include story text in the illustration following children's book industry standards for text placement and readability: "${page.story_text}"`
  }

  // Add style instructions
  prompt += `. Pencil sketch, black and white line art, draft illustration, children's book composition, hand-drawn sketch style, NO COLOR, rough draft quality, professional book illustrator sketch`

  return prompt
}
