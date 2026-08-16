import type { Plugin } from '@deepseek-ai/cordis'
import type { z } from 'zod'

export type ModActivationPolicy = 'immediate' | 'next_chapter'

export interface ModConfigField {
  key: string
  label: string
  type: 'select' | 'boolean' | 'character-select'
  options?: Array<{ value: string; label: string }>
  visibleWhen?: { key: string; values: string[] }
}

export interface TrustedModDefinition {
  id: string
  name: string
  description: string
  version: string
  activationPolicy: ModActivationPolicy
  schema: z.ZodType<Record<string, unknown>>
  defaultConfig: Record<string, unknown>
  configFields: ModConfigField[]
  plugin: Plugin
}
