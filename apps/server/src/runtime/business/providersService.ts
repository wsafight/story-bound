import type { Database } from 'bun:sqlite'
import { type Context, Service } from '@deepseek-ai/cordis'
import type { CreateModelProviderInput, UpdateModelProviderInput } from '../../domain/schemas'
import { ModelProvidersRepository } from '../../repositories/modelProviders'
import { createValidatedProvider, updateValidatedProvider } from '../../services/modelProviderService'
import { AppError } from '../../shared/errors'
import type { StoryboundLlmService } from '../infrastructureRuntime'

declare module '@deepseek-ai/cordis' {
  interface Context {
    providers: StoryboundProvidersService
  }
}

export class StoryboundProvidersService extends Service {
  private readonly repository: ModelProvidersRepository

  constructor(
    ctx: Context,
    private readonly database: Database,
    private readonly llm: StoryboundLlmService,
  ) {
    super(ctx, 'providers')
    this.repository = new ModelProvidersRepository(database)
  }

  list() {
    return this.repository.list()
  }

  get(providerId: string) {
    return this.repository.get(providerId)
  }

  async health(providerId?: string, force = false) {
    const snapshot = providerId
      ? (() => {
          const provider = this.repository.get(providerId)
          if (!provider) throw new AppError(404, 'PROVIDER_NOT_FOUND', '没有找到这个模型 Provider')
          return this.repository.snapshot(provider)
        })()
      : this.repository.defaultSnapshot()
    return this.llm.health(snapshot, { force })
  }

  async create(input: CreateModelProviderInput) {
    const provider = await createValidatedProvider(input, this.database)
    this.llm.invalidateHealth(provider.id)
    return provider
  }

  async update(providerId: string, input: UpdateModelProviderInput) {
    const provider = await updateValidatedProvider(providerId, input, this.database)
    this.llm.invalidateHealth(provider.id)
    return provider
  }

  setDefault(providerId: string) {
    const provider = this.repository.setDefault(providerId)
    if (!provider) throw new AppError(404, 'PROVIDER_NOT_FOUND', '没有找到这个模型 Provider')
    return provider
  }

  delete(providerId: string) {
    if (!this.repository.delete(providerId)) {
      throw new AppError(409, 'PROVIDER_DELETE_BLOCKED', '默认、唯一或仍被存档引用的 Provider 不能删除')
    }
    this.llm.invalidateHealth(providerId)
  }
}
