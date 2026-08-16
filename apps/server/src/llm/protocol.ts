import type { ModelProviderSnapshot } from '../repositories/modelProviders'
import { resolveModelLimits } from './modelLimits'
import { ModelProviderError, type ModelUsage } from './modelTypes'

function retryAfterMs(value: string | null) {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value) * 1_000
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

export function providerRequestId(headers: Headers) {
  return headers.get('x-request-id') || headers.get('x-deepseek-request-id') || undefined
}

export function mapUsage(value: Record<string, unknown>): ModelUsage {
  const promptDetails = value.prompt_tokens_details as Record<string, unknown> | undefined
  const completionDetails = value.completion_tokens_details as Record<string, unknown> | undefined
  const cacheRead = Number(promptDetails?.cached_tokens ?? value.prompt_cache_hit_tokens)
  const reasoning = Number(completionDetails?.reasoning_tokens)
  const prompt = Number(value.prompt_tokens || 0)
  return {
    inputTokens: Math.max(0, prompt),
    outputTokens: Number(value.completion_tokens || 0),
    ...(Number.isFinite(cacheRead) ? { cacheReadTokens: cacheRead } : {}),
    ...(Number.isFinite(reasoning) ? { reasoningTokens: reasoning } : {}),
  }
}

export function mapHttpError(status: number, body: string, headers: Headers) {
  let detail = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string; type?: string } }
    detail = [parsed.error?.message, parsed.error?.code, parsed.error?.type].filter(Boolean).join(' ')
  } catch {
    detail = body.slice(0, 500)
  }
  const requestId = providerRequestId(headers)
  const retry = retryAfterMs(headers.get('retry-after'))
  if (status === 401 || status === 403) {
    return new ModelProviderError('MODEL_AUTH', '模型服务拒绝了凭据，请检查 API Key', false, status, retry, requestId)
  }
  if (status === 429) {
    return new ModelProviderError('MODEL_RATE_LIMIT', '模型服务请求过多，请稍后重试', true, status, retry, requestId)
  }
  if (status === 400 && /context|token.{0,20}(limit|maximum)|too long/i.test(detail)) {
    return new ModelProviderError('MODEL_CONTEXT_LIMIT', '当前上下文超过模型限制', false, status, retry, requestId)
  }
  if (status >= 500) {
    return new ModelProviderError(
      'MODEL_PROVIDER_ERROR',
      '模型服务暂时不可用，输入已保存',
      true,
      status,
      retry,
      requestId,
    )
  }
  return new ModelProviderError('MODEL_REQUEST_INVALID', '模型服务无法处理当前请求', false, status, retry, requestId)
}

export function authorizationHeaders(
  provider: ModelProviderSnapshot,
  resolveCredential: (credentialRef: string) => string,
): Record<string, string> {
  const apiKey = resolveCredential(provider.credentialRef)
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

export function chatBody(
  provider: ModelProviderSnapshot,
  input: {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  },
) {
  const { maxOutputTokens } = resolveModelLimits(provider.contextWindow, provider.maxOutputTokens)
  return {
    model: provider.model,
    messages: [{ role: 'system', content: input.system }, ...input.messages],
    stream: true,
    stream_options: { include_usage: true },
    temperature: provider.temperature,
    max_tokens: maxOutputTokens,
    ...(provider.thinkingMode === 'auto'
      ? {}
      : { thinking: { type: provider.thinkingMode === 'on' ? 'enabled' : 'disabled' } }),
    ...(provider.thinkingEffort ? { reasoning_effort: provider.thinkingEffort } : {}),
  }
}
