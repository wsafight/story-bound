import type { ModelProviderSnapshot } from '../repositories/modelProviders'

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  reasoningTokens?: number
}

export type ModelStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; usage: ModelUsage }
  | { type: 'finish'; reason: string }
  | { type: 'metadata'; requestId?: string }

export class ModelProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    public readonly requestId?: string,
  ) {
    super(message)
  }
}

export interface ModelHealth {
  online: boolean
  providerId: string
  providerName: string
  model: string
  models: string[]
  reason?: string
  checkedAt: string
}

export interface ModelStreamInput {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  signal: AbortSignal
  provider: ModelProviderSnapshot
}

export function normalizeModelError(error: unknown) {
  if (error instanceof ModelProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      requestId: error.requestId,
    }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'GENERATION_CANCELLED', message: '生成已停止', retryable: true }
  }
  return { code: 'MODEL_UNAVAILABLE', message: '无法连接模型服务，输入已保存', retryable: true }
}
