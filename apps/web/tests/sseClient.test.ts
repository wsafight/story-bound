import { afterEach, describe, expect, it } from 'bun:test'
import { ApiError } from '../src/app/apiClient'
import { streamPost } from '../src/app/sseClient'

const originalFetch = globalThis.fetch

function streamResponse(parts: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

const message = {
  id: 'reply',
  conversationId: 'c1',
  chapterId: 'chapter-1',
  parentMessageId: 'm1',
  generationId: 'g1',
  sender: 'narrator',
  characterId: null,
  inputMode: null,
  content: '雨',
  createdAt: '2026-08-16T00:00:00.000Z',
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('浏览器生成流协议', () => {
  it('只在收到 completed 终止事件后成功结束', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        streamResponse([
          `event: accepted\ndata: ${JSON.stringify({ generationId: 'g1', playerMessageId: 'm1', playerMessage: { ...message, id: 'm1', sender: 'player' } })}\n\n`,
          ': keep-alive\n\n',
          'event: delta\ndata: {"generationId":"g1","text":"雨"}\n\n',
          `event: completed\ndata: ${JSON.stringify({ generationId: 'g1', message, activeLeafMessageId: 'reply', activeCheckpointId: 'checkpoint-1', updatedAt: '2026-08-16T00:00:00.000Z' })}\n\n`,
        ]),
      )) as typeof fetch
    const events: string[] = []
    await streamPost('/test', {}, (event) => events.push(event.event))
    expect(events).toEqual(['accepted', 'delta', 'completed'])
  })

  it('连接在终止事件前关闭时返回 STREAM_CLOSED', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        streamResponse([
          `event: accepted\ndata: ${JSON.stringify({ generationId: 'g1', playerMessageId: 'm1', playerMessage: { ...message, id: 'm1', sender: 'player' } })}\n\n`,
          'event: delta\ndata: {"generationId":"g1","text":"未完成"}\n\n',
        ]),
      )) as typeof fetch
    try {
      await streamPost('/test', {}, () => undefined)
      throw new Error('expected streamPost to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('STREAM_CLOSED')
    }
  })
})
