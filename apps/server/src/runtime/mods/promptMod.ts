import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { z } from 'zod'
import type { PromptAssemblyRequest, PromptContribution } from '../storyboundRuntime'
import type { TrustedModDefinition } from './types'

function activeConfig(request: PromptAssemblyRequest, modId: string) {
  return request.activeMods[modId]?.config
}

export function createPromptMod(
  meta: Pick<TrustedModDefinition, 'id' | 'name'>,
  schema: z.ZodType<Record<string, unknown>>,
  createContribution: (
    config: Record<string, unknown>,
    request: PromptAssemblyRequest,
  ) => Omit<PromptContribution, 'modId'>,
): Plugin {
  return {
    name: `storybound-mod:${meta.id}`,
    Config: schema,
    inject: ['storybound'],
    apply(ctx: Context) {
      ctx.on('storybound/prompt/contribute', (request, contribute) => {
        const config = activeConfig(request, meta.id)
        if (!config) return
        contribute({ modId: meta.id, ...createContribution(config, request) })
      })
    },
  }
}
