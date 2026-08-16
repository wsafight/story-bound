import { z } from 'zod'

const providerFields = {
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['local', 'remote']),
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().max(2_000).optional(),
  defaultModel: z.string().trim().min(1).max(160),
  contextWindow: z.number().int().min(1_024).max(4_000_000),
  maxOutputTokens: z.number().int().min(64).max(262_144),
  thinkingMode: z.enum(['off', 'auto', 'on']),
  thinkingEffort: z.enum(['low', 'medium', 'high']).nullable(),
}

export const createModelProviderSchema = z.object(providerFields)
export const updateModelProviderSchema = z
  .object(providerFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, '至少需要修改一项配置')

export type CreateModelProviderInput = z.infer<typeof createModelProviderSchema>
export type UpdateModelProviderInput = z.infer<typeof updateModelProviderSchema>
