import { z } from 'zod'

export const defaultCustomStateSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

export const customStateJsonSchema = z.record(z.string(), z.unknown()).default(defaultCustomStateSchema)

export const customStateDefaultsSchema = z.record(z.string(), z.unknown()).default({})

export const statePolicySchema = z
  .array(
    z.object({
      path: z
        .string()
        .trim()
        .regex(/^\/custom(?:\/[A-Za-z0-9_-]+)*$/),
      label: z.string().trim().max(80).optional(),
      playerEditable: z.boolean().default(false),
      storyEditable: z.boolean().default(true),
      appManaged: z.boolean().default(false),
    }),
  )
  .max(100)
  .default([])

export type CustomStateJsonSchema = z.infer<typeof customStateJsonSchema>
export type CustomStateDefaults = z.infer<typeof customStateDefaultsSchema>
export type StatePolicy = z.infer<typeof statePolicySchema>
