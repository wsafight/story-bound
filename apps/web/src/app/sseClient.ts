import { type GenerationStreamEvent, generationStreamEventSchema } from '@storybound/shared'
import { createParser } from 'eventsource-parser'
import { ApiError, authorizedHeaders } from './apiClient'

export type StreamEvent = GenerationStreamEvent

export async function streamPost(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: authorizedHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(
      response.status,
      payload?.error?.code || 'REQUEST_FAILED',
      payload?.error?.message || '请求失败，请稍后重试',
    )
  }
  if (!response.body) throw new ApiError(502, 'STREAM_UNAVAILABLE', '浏览器无法读取模型响应流')

  let terminalEvent = false
  const parser = createParser({
    onEvent(message) {
      if (!message.event) return
      try {
        if (terminalEvent) throw new Error('Unexpected stream event')
        const event = generationStreamEventSchema.parse({ event: message.event, data: JSON.parse(message.data) })
        if (event.event === 'completed' || event.event === 'error') terminalEvent = true
        onEvent(event)
      } catch {
        throw new ApiError(502, 'STREAM_INVALID', '模型响应流格式不正确')
      }
    },
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parser.feed(decoder.decode(value, { stream: true }))
  }
  parser.feed(decoder.decode())
  if (!terminalEvent) throw new ApiError(502, 'STREAM_CLOSED', '生成响应意外中断，请重试')
}
