import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

/**
 * Converts zodResponseFormat (Chat Completions format) to the flat format
 * expected by the Responses API's text.format parameter.
 *
 * zodResponseFormat produces: { type, json_schema: { name, schema, strict } }
 * Responses API expects:      { type, name, schema, strict }
 */
export function zodToResponsesFormat(zodSchema: z.ZodType, name: string) {
  const chatFormat = zodResponseFormat(zodSchema, name)
  return {
    type: 'json_schema' as const,
    name: chatFormat.json_schema.name,
    strict: chatFormat.json_schema.strict,
    schema: chatFormat.json_schema.schema,
  }
}

// ============================================================
// Character Form Parsing (12 fixed nullable string fields)
// ============================================================
export const CharacterFormSchema = z.object({
  name: z.string().nullable(),
  biography: z.string().nullable(),
  age: z.string().nullable(),
  ethnicity: z.string().nullable(),
  skin_color: z.string().nullable(),
  hair_color: z.string().nullable(),
  hair_style: z.string().nullable(),
  eye_color: z.string().nullable(),
  clothing: z.string().nullable(),
  accessories: z.string().nullable(),
  special_features: z.string().nullable(),
  gender: z.string().nullable(),
})

// ============================================================
// Story Page Parsing
// ============================================================
export const PageParsingSchema = z.object({
  pages: z.array(z.object({
    page_number: z.number().int(),
    story_text: z.string(),
    scene_description: z.string().nullable(),
    description_auto_generated: z.boolean(),
  }))
})

// ============================================================
// Scene Descriptions (batch + per-page fallback)
// Uses array for character_actions to avoid dynamic keys in strict mode
// ============================================================
export const SceneDescriptionPageSchema = z.object({
  page_number: z.number().int(),
  summary: z.string(),
  character_actions: z.array(z.object({
    character_name: z.string(),
    action: z.string(),
  })),
  background_elements: z.string(),
  atmosphere: z.string(),
})

export const SceneDescriptionBatchSchema = z.object({
  pages: z.array(SceneDescriptionPageSchema)
})

export const SceneDescriptionSingleSchema = z.object({
  summary: z.string(),
  character_actions: z.array(z.object({
    character_name: z.string(),
    action: z.string(),
  })),
  background_elements: z.string(),
  atmosphere: z.string(),
})

// ============================================================
// Character Identification + Suggestion
// ============================================================
export const CharacterIdentificationSchema = z.object({
  characters: z.array(z.object({
    name: z.string(),
    role: z.string(),
    appears_in: z.array(z.number().int()),
    story_role: z.string(),
  }))
})

// ============================================================
// AI Director
// Uses array for character_actions to avoid dynamic keys in strict mode
// ============================================================
export const DirectorSchema = z.object({
  character_actions: z.array(z.object({
    character_name: z.string(),
    action: z.string(),
  })),
  illustration_prompt: z.string(),
})

// ============================================================
// Helpers
// ============================================================

/**
 * Converts character_actions from array format (used in structured outputs)
 * to object format (used in DB storage): [{character_name, action}] -> {name: action}
 */
export function actionsArrayToObject(actions: Array<{ character_name: string; action: string }>): Record<string, string> {
  const obj: Record<string, string> = {}
  for (const a of actions) {
    obj[a.character_name] = a.action
  }
  return obj
}

/**
 * Extracts the text content from a Responses API completion, handling refusals.
 * Returns { text, refusal } -- one will be null.
 */
export function extractResponseContent(completion: any): { text: string | null; refusal: string | null } {
  const msgOut = completion.output?.find((o: any) => o.type === 'message')
  if (!msgOut || !('content' in msgOut)) return { text: null, refusal: null }

  const firstContent = msgOut.content?.[0]
  if (!firstContent) return { text: null, refusal: null }

  if ('refusal' in firstContent && firstContent.refusal) {
    return { text: null, refusal: firstContent.refusal }
  }

  const text = 'text' in firstContent ? firstContent.text : null
  return { text: text?.trim() || null, refusal: null }
}
