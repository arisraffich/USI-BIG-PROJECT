# AI Engines — Character Generation

Each engine implements the `CharacterEngine` function type: accepts a prompt + image buffers, returns base64 image data. The orchestrator (`character-generator.ts`) handles everything else (fetching references, uploading, DB updates, cleanup).

## Current Models

| Key          | UI Label | Model ID                         | Provider | Notes                              |
|--------------|----------|----------------------------------|----------|------------------------------------|
| `gemini`     | NB2      | `gemini-3.1-flash-image-preview` | Google   | Thinking: controllable (HIGH/min)  |
| `gemini-pro` | NB Pro   | `gemini-3-pro-image-preview`     | Google   | Thinking: always on, not disablable|
| `gpt`        | GPT 2    | `gpt-5.4` + `gpt-image-2`        | OpenAI   | Responses API with tool call       |

## Add a Gemini variant

Gemini models share the same API format — use the factory in `gemini.ts`:

1. `gemini.ts` → `export const myEngine = createGeminiEngine('gemini-model-id')`
2. `index.ts` → add to exports
3. `types.ts` → add key to `AIModel` union
4. `character-generator.ts` → add to `ENGINES` map
5. `UnifiedCharacterCard.tsx` → add `<SelectItem value="key">Label</SelectItem>`

If the new model has different thinking behavior, update the `isPro` logic in `createGeminiEngine`.

## Add a new provider (non-Google)

1. Create `engines/newprovider.ts` exporting a `CharacterEngine` function
2. Follow steps 2–5 above
3. The engine receives `EngineInput` (prompt, isEditMode, styleReference, visualReference, useThinking) and must return `EngineOutput` ({ base64 })
4. Image buffers arrive as raw `Buffer` — convert to whatever format the provider needs (data URL, HTTP URL, etc.)

## File overview

```
engines/
  types.ts              — AIModel union, EngineInput/Output, CharacterEngine type
  gemini.ts             — Factory: createGeminiEngine(modelId) → NB2 + NB Pro
  gpt.ts                — GPT Image 2 via OpenAI Responses API (gpt-5.4 orchestrator)
  index.ts              — Barrel exports
  README.md             — This file
character-generator.ts  — Orchestrator: image fetch → engine → upload → DB
```
