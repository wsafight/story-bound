import { createParser } from 'eventsource-parser'
import { config } from '../config'
import { validateProviderEndpoint } from '../services/modelProviderService'
import { ModelProviderError, type ModelStreamChunk, type ModelStreamInput } from './modelTypes'
import { authorizationHeaders, chatBody, mapHttpError, mapUsage, providerRequestId } from './protocol'

export async function* streamModelWithCredentials(
  input: ModelStreamInput,
  resolveCredential: (credentialRef: string) => string,
): AsyncGenerator<ModelStreamChunk> {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  input.signal.addEventListener('abort', abortFromCaller, { once: true })
  let timeoutCode: 'MODEL_CONNECT_TIMEOUT' | 'MODEL_FIRST_TOKEN_TIMEOUT' | 'MODEL_IDLE_TIMEOUT' | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const armTimeout = (code: NonNullable<typeof timeoutCode>, delay: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timeoutCode = code
      controller.abort()
    }, delay)
  }

  try {
    await validateProviderEndpoint(input.provider.kind, input.provider.baseUrl)
    armTimeout('MODEL_CONNECT_TIMEOUT', config.llmConnectTimeoutMs)
    const response = await fetch(`${input.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...authorizationHeaders(input.provider, resolveCredential),
      },
      body: JSON.stringify(chatBody(input.provider, input)),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const requestId = providerRequestId(response.headers)
    if (!response.ok) throw mapHttpError(response.status, await response.text(), response.headers)
    if (!response.body) throw new ModelProviderError('MODEL_STREAM_UNAVAILABLE', '模型服务没有返回可读响应流', true)
    yield { type: 'metadata', requestId }

    let sawDone = false
    let sawFirstToken = false
    let parserFailure: Error | null = null
    const queue: ModelStreamChunk[] = []
    const onActivity = () => {
      if (sawFirstToken) armTimeout('MODEL_IDLE_TIMEOUT', config.llmIdleTimeoutMs)
    }
    const parser = createParser({
      onComment: onActivity,
      onEvent(message) {
        onActivity()
        if (message.data === '[DONE]') {
          sawDone = true
          return
        }
        try {
          const payload = JSON.parse(message.data) as {
            choices?: Array<{
              delta?: { content?: string | null; reasoning_content?: string | null }
              finish_reason?: string | null
            }>
            usage?: Record<string, unknown>
          }
          for (const choice of payload.choices || []) {
            const reasoning = choice.delta?.reasoning_content
            const text = choice.delta?.content
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              sawFirstToken = true
              armTimeout('MODEL_IDLE_TIMEOUT', config.llmIdleTimeoutMs)
              queue.push({ type: 'reasoning', text: reasoning })
            }
            if (typeof text === 'string' && text.length > 0) {
              sawFirstToken = true
              armTimeout('MODEL_IDLE_TIMEOUT', config.llmIdleTimeoutMs)
              queue.push({ type: 'text', text })
            }
            if (typeof choice.finish_reason === 'string') queue.push({ type: 'finish', reason: choice.finish_reason })
          }
          if (payload.usage) queue.push({ type: 'usage', usage: mapUsage(payload.usage) })
        } catch (error) {
          parserFailure = error instanceof Error ? error : new Error(String(error))
        }
      },
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    armTimeout('MODEL_FIRST_TOKEN_TIMEOUT', config.llmFirstTokenTimeoutMs)
    while (!sawDone) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
      if (parserFailure)
        throw new ModelProviderError(
          'MODEL_MALFORMED_RESPONSE',
          '模型响应格式不正确',
          true,
          undefined,
          undefined,
          requestId,
        )
      while (queue.length > 0) yield queue.shift()!
    }
    parser.feed(decoder.decode())
    while (queue.length > 0) yield queue.shift()!
    if (!sawDone)
      throw new ModelProviderError(
        'MODEL_STREAM_CLOSED',
        '模型响应意外中断，可以重试',
        true,
        undefined,
        undefined,
        requestId,
      )
  } catch (error) {
    if (error instanceof ModelProviderError) throw error
    if (input.signal.aborted) throw new ModelProviderError('GENERATION_CANCELLED', '生成已停止', true)
    if (timeoutCode) {
      const messages = {
        MODEL_CONNECT_TIMEOUT: '连接模型服务超时',
        MODEL_FIRST_TOKEN_TIMEOUT: '模型长时间没有开始响应',
        MODEL_IDLE_TIMEOUT: '模型响应中断过久',
      }
      throw new ModelProviderError(timeoutCode, messages[timeoutCode], true)
    }
    throw new ModelProviderError('MODEL_UNAVAILABLE', '无法连接模型服务，输入已保存', true)
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener('abort', abortFromCaller)
  }
}
