import { z } from 'zod'
import { narrativePreferencesSchema } from './narrative'
import { type ContractSchemaOptions, defaultContractOptions } from './options'

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(80),
  sceneId: z.string().trim().min(1).optional(),
  providerId: z.string().min(1).optional(),
  player: z.object({
    name: z.string().trim().min(1).max(40),
    pronouns: z.string().trim().max(30).default('不限定'),
    note: z.string().trim().max(500).default(''),
  }),
  abilityIds: z.array(z.string()).max(8).default([]),
  narrative: narrativePreferencesSchema.prefault({}),
})

export function createSendMessageSchema(options: ContractSchemaOptions = defaultContractOptions) {
  return z.object({
    clientMessageId: z.string().uuid(),
    expectedLeafMessageId: z.string().min(1),
    content: z.string().trim().min(1).max(options.maxMessageChars),
    inputMode: z.enum(['dialogue', 'action', 'narration']),
  })
}

export const retrySchema = z.object({ expectedLeafMessageId: z.string().min(1) })

export const regenerateSchema = z.object({
  operationId: z.string().uuid(),
  expectedLeafMessageId: z.string().min(1),
})

export const selectReplyCandidateSchema = z.object({
  messageId: z.string().min(1),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export function createEditAndRetrySchema(options: ContractSchemaOptions = defaultContractOptions) {
  return z.object({
    operationId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    expectedLeafMessageId: z.string().min(1),
    content: z.string().trim().min(1).max(options.maxMessageChars),
    inputMode: z.enum(['dialogue', 'action', 'narration']),
  })
}

export const updateConversationModSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, '至少需要修改一项存档信息')

export const pinMemorySchema = z.object({
  messageId: z.string().min(1),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const closeChapterSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(4_000),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const updateConversationStateSchema = z.object({
  custom: z.record(z.string(), z.unknown()).default({}),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const forkConversationSchema = z.object({
  messageId: z.string().min(1),
  title: z.string().trim().min(1).max(80).optional(),
})

export const useAbilitySchema = z.object({
  abilityId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  statePatch: z.record(z.string(), z.unknown()).default({}),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const createStateSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(1_000).default(''),
  patch: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(['model', 'user', 'system']).default('user'),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const resolveStateSuggestionSchema = z.object({
  suggestionId: z.string().min(1),
  accept: z.boolean(),
  patch: z.record(z.string(), z.unknown()).optional(),
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
})

export const updateNodeProgressSchema = z.object({
  expectedLeafMessageId: z.string().min(1),
  expectedCheckpointId: z.string().min(1),
  note: z.string().trim().max(1_000).optional(),
})

export const sendMessageSchema = createSendMessageSchema()
export const editAndRetrySchema = createEditAndRetrySchema()

export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type SelectReplyCandidateInput = z.infer<typeof selectReplyCandidateSchema>
export type UpdateConversationModInput = z.infer<typeof updateConversationModSchema>
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>
export type PinMemoryInput = z.infer<typeof pinMemorySchema>
export type CloseChapterInput = z.infer<typeof closeChapterSchema>
export type UpdateConversationStateInput = z.infer<typeof updateConversationStateSchema>
export type ForkConversationInput = z.infer<typeof forkConversationSchema>
export type UseAbilityInput = z.infer<typeof useAbilitySchema>
export type CreateStateSuggestionInput = z.infer<typeof createStateSuggestionSchema>
export type ResolveStateSuggestionInput = z.infer<typeof resolveStateSuggestionSchema>
export type UpdateNodeProgressInput = z.infer<typeof updateNodeProgressSchema>
