export type AIModel = 'gemini' | 'gemini-pro' | 'gpt'

export interface ImageRef {
  buffer: Buffer
  mimeType: string
}

export interface EngineInput {
  prompt: string
  isEditMode: boolean
  styleReference?: ImageRef | null
  visualReference?: ImageRef | null
  useThinking?: boolean
}

export interface EngineOutput {
  base64: string
}

export type CharacterEngine = (input: EngineInput) => Promise<EngineOutput>
