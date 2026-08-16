import { type Context, Service } from '@deepseek-ai/cordis'
import { config } from '../config'
import type { ModelAdapterRuntime, ModelStreamInput } from '../llm/adapter'
import { GenerationScheduler } from '../llm/workScheduler'
import type { ModelProviderSnapshot } from '../repositories/modelProviders'

declare module '@deepseek-ai/cordis' {
  interface Context {
    llm: StoryboundLlmService
    scheduler: StoryboundSchedulerService
  }
}

export class StoryboundLlmService extends Service {
  constructor(
    ctx: Context,
    private readonly adapter: ModelAdapterRuntime,
  ) {
    super(ctx, 'llm')
  }

  stream(input: ModelStreamInput) {
    return this.adapter.stream(input)
  }

  health(provider: ModelProviderSnapshot, options: { force?: boolean } = {}) {
    return this.adapter.getHealth(provider, options)
  }

  invalidateHealth(providerId?: string) {
    this.adapter.invalidate(providerId)
  }

  pruneHealthCache(now = Date.now()) {
    this.adapter.prune(now)
  }

  dispose() {
    this.adapter.dispose()
  }
}

export class StoryboundSchedulerService extends Service {
  private readonly scheduler: GenerationScheduler

  constructor(ctx: Context, limit = config.llmMaxConcurrency) {
    super(ctx, 'scheduler')
    this.scheduler = new GenerationScheduler(limit)
  }

  acquire() {
    return this.scheduler.acquire()
  }

  status() {
    return this.scheduler.status()
  }

  reset() {
    this.scheduler.reset()
  }
}
