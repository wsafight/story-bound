import { z } from 'zod'

export const updateRuntimeModSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => value.enabled !== undefined || value.defaultConfig !== undefined, '至少需要修改一项 MOD 配置')

export type UpdateRuntimeModInput = z.infer<typeof updateRuntimeModSchema>
