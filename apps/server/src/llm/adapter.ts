import { config } from '../config'
import {
  getDefaultProviderSnapshot,
  getProviderCredential,
  type ModelProviderSnapshot,
} from '../repositories/modelProviders'
import { checkModelHealth } from './modelHealth'
import { streamModelWithCredentials } from './modelStream'
import type { ModelHealth, ModelStreamInput } from './modelTypes'

export * from './modelTypes'

function healthCacheKey(provider: ModelProviderSnapshot) {
  return [
    provider.providerId,
    provider.credentialRef,
    provider.name,
    provider.kind,
    provider.baseUrl,
    provider.model,
  ].join('\n')
}

function trimHealthCache(cache: Map<string, unknown>) {
  while (cache.size > 100) cache.delete(cache.keys().next().value!)
}

export function streamModel(input: ModelStreamInput) {
  return streamModelWithCredentials(input, getProviderCredential)
}

export class ModelAdapterRuntime {
  private readonly healthCache = new Map<string, { expiresAt: number; value: ModelHealth }>()
  private readonly healthRequests = new Map<string, Promise<ModelHealth>>()

  constructor(
    private readonly resolveCredential: (credentialRef: string) => string = getProviderCredential,
    private readonly healthCacheTtlMs = config.modelHealthCacheTtlMs,
  ) {}

  stream(input: ModelStreamInput) {
    return streamModelWithCredentials(input, this.resolveCredential)
  }

  getHealth(provider: ModelProviderSnapshot, options: { force?: boolean } = {}) {
    const key = healthCacheKey(provider)
    const cached = this.healthCache.get(key)
    if (!options.force && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
    const active = this.healthRequests.get(key)
    if (active) return active

    const request = checkModelHealth(provider, this.resolveCredential)
      .then((value) => {
        this.healthCache.delete(key)
        this.healthCache.set(key, { expiresAt: Date.now() + this.healthCacheTtlMs, value })
        trimHealthCache(this.healthCache)
        return value
      })
      .finally(() => {
        if (this.healthRequests.get(key) === request) this.healthRequests.delete(key)
      })
    this.healthRequests.set(key, request)
    return request
  }

  invalidate(providerId?: string) {
    if (!providerId) {
      this.healthCache.clear()
      return
    }
    for (const key of this.healthCache.keys()) {
      if (key.startsWith(`${providerId}\n`)) this.healthCache.delete(key)
    }
  }

  prune(now = Date.now()) {
    for (const [key, cached] of this.healthCache) {
      if (cached.expiresAt <= now) this.healthCache.delete(key)
    }
  }

  dispose() {
    this.healthCache.clear()
    this.healthRequests.clear()
  }
}

const defaultModelAdapter = new ModelAdapterRuntime()

export function getModelHealth(provider = getDefaultProviderSnapshot(), options: { force?: boolean } = {}) {
  return defaultModelAdapter.getHealth(provider, options)
}

export function invalidateModelHealthCache(providerId?: string) {
  defaultModelAdapter.invalidate(providerId)
}
