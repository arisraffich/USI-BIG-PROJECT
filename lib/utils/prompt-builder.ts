import { Character } from '@/types/character'
import { Page } from '@/types/page'
import { Project } from '@/types/project'

export function buildCharacterPrompt(character: Character): string {
  const parts: string[] = []

  // Basic description
  if (character.age) parts.push(`${character.age} year old`)
  if (character.gender && character.gender !== 'N/A')
    parts.push(character.gender)
  if (character.name) {
    parts.push(`named ${character.name}`)
  } else if (character.role) {
    parts.push(character.role)
  }

  // Physical attributes
  if (character.ethnicity && character.ethnicity !== 'N/A') {
    parts.push(`${character.ethnicity} ethnicity`)
  }
  if (character.skin_color && character.skin_color !== 'N/A') {
    parts.push(`${character.skin_color} skin`)
  }
  if (character.hair_color && character.hair_color !== 'N/A') {
    parts.push(`${character.hair_color} hair`)
  }
  if (character.hair_style && character.hair_style !== 'N/A') {
    parts.push(`${character.hair_style} hairstyle`)
  }
  if (character.eye_color && character.eye_color !== 'N/A') {
    parts.push(`${character.eye_color} eyes`)
  }

  // Clothing and accessories
  if (character.clothing && character.clothing !== 'N/A') {
    parts.push(`wearing ${character.clothing}`)
  }
  if (character.accessories && character.accessories !== 'N/A') {
    parts.push(`with ${character.accessories}`)
  }

  // Special features
  if (character.special_features && character.special_features !== 'N/A') {
    parts.push(character.special_features)
  }

  const basePrompt = parts.join(', ')

  // Add style instructions
  return `${basePrompt}, children's book character illustration, COLORED, hand-drawn style, warm and inviting, NOT photorealistic, NOT digital art looking, professional children's book quality, in the style of the reference character illustration provided`
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













