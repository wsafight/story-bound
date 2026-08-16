import { config } from '../config'
import type { ModelProviderSnapshot } from '../repositories/modelProviders'
import { validateProviderEndpoint } from '../services/modelProviderService'
import { type ModelHealth, normalizeModelError } from './modelTypes'
import { authorizationHeaders, mapHttpError } from './protocol'

export async function checkModelHealth(
  provider: ModelProviderSnapshot,
  resolveCredential: (credentialRef: string) => string,
): Promise<ModelHealth> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.llmConnectTimeoutMs)
  try {
    await validateProviderEndpoint(provider.kind, provider.baseUrl)
    const response = await fetch(`${provider.baseUrl}/models`, {
      redirect: 'error',
      headers: authorizationHeaders(provider, resolveCredential),
      signal: controller.signal,
    })
    if (!response.ok) throw mapHttpError(response.status, await response.text(), response.headers)
    const payload = (await response.json()) as { data?: Array<{ id?: string }> }
    const models = (payload.data || []).map((item) => item.id).filter((id): id is string => Boolean(id))
    return {
      online: true,
      providerId: provider.providerId,
      providerName: provider.name,
      model: provider.model,
      models,
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    const normalized = normalizeModelError(error)
    return {
      online: false,
      providerId: provider.providerId,
      providerName: provider.name,
      model: provider.model,
      models: [],
      reason: normalized.message,
      checkedAt: new Date().toISOString(),
    }
  } finally {
    clearTimeout(timeout)
  }
}
