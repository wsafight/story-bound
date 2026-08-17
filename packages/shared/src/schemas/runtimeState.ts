import { z } from 'zod'
import { type ContractSchemaOptions, defaultContractOptions } from './options'

const stateIdSchema = z.string().trim().min(1).max(100)
const timestampSchema = z.string().trim().min(1).max(80)

export function createRuntimeStateSchema(options: ContractSchemaOptions = defaultContractOptions) {
  const pinnedMemorySchema = z.object({
    messageId: stateIdSchema,
    content: z.string().trim().min(1).max(options.maxMessageChars),
    createdAt: timestampSchema,
  })

  const chapterSummarySchema = z.object({
    chapterId: stateIdSchema,
    number: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(4_000),
    closedAt: timestampSchema,
  })
  const longTermMemorySchema = z.object({
    id: stateIdSchema,
    fromMessageId: stateIdSchema,
    toMessageId: stateIdSchema,
    fromDepth: z.number().int().min(0),
    toDepth: z.number().int().min(0),
    messageCount: z.number().int().positive(),
    summary: z.string().trim().min(1).max(4_000),
    facts: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    createdAt: timestampSchema,
  })
  const abilityUseSchema = z.object({
    count: z.number().int().min(0),
    lastUsedAtMessageId: stateIdSchema.optional(),
    lastUsedAtDepth: z.number().int().min(0).optional(),
    updatedAt: timestampSchema.optional(),
  })
  const stateDiffEntrySchema = z.object({
    path: z.string().trim().min(1).max(200),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    beforeMissing: z.boolean().optional(),
    afterMissing: z.boolean().optional(),
  })
  const stateSuggestionSchema = z.object({
    id: stateIdSchema,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(1_000).default(''),
    patch: z.record(z.string(), z.unknown()).default({}),
    diff: z.array(stateDiffEntrySchema).max(100).optional(),
    source: z.enum(['model', 'user', 'system']).default('user'),
    status: z.enum(['pending', 'accepted', 'rejected']),
    createdAt: timestampSchema,
    resolvedAt: timestampSchema.optional(),
  })
  const nodeProgressSchema = z.object({
    status: z.enum(['inactive', 'available', 'active', 'completed', 'skipped']).default('inactive'),
    updatedAt: timestampSchema.optional(),
    anchorMessageId: stateIdSchema.optional(),
  })

  return z
    .object({
      phase: z.string().trim().max(120).optional(),
      scene: z
        .object({
          location: z.string().trim().max(200).optional(),
          time: z.string().trim().max(200).optional(),
          participantIds: z.array(stateIdSchema).max(30).optional(),
        })
        .optional(),
      custom: z
        .object({
          pinnedMemories: z.array(pinnedMemorySchema).max(50).optional(),
          chapterSummaries: z.array(chapterSummarySchema).max(50).optional(),
          longTermMemories: z.array(longTermMemorySchema).max(50).optional(),
          abilityUses: z.record(stateIdSchema, abilityUseSchema).optional(),
          stateSuggestions: z.array(stateSuggestionSchema).max(50).optional(),
          nodeProgress: z.record(stateIdSchema, nodeProgressSchema).optional(),
        })
        .catchall(z.unknown())
        .optional(),
    })
    .catchall(z.unknown())
}

export const runtimeStateSchema = createRuntimeStateSchema()
export type RuntimeState = z.infer<typeof runtimeStateSchema>
