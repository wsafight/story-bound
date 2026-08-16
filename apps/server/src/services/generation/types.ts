import type { GenerationStreamEvent } from '@storybound/shared'
import type { ModelStreamInput, streamModel } from '../../llm/adapter'

export type Row = Record<string, unknown>
export type GenerationKind = 'send' | 'retry' | 'regenerate' | 'edit'

export interface PreparedGeneration {
  id: string
  conversationId: string
  playerMessageId: string
  kind: GenerationKind
  duplicate?: boolean
}

export type GenerationEvent = GenerationStreamEvent

export interface GenerationModelRuntime {
  stream(input: ModelStreamInput): ReturnType<typeof streamModel>
}
