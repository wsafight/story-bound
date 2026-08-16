import { afterEach, beforeAll, describe, expect, it } from 'bun:test'

const { db } = await import('../src/db/connection')
const { initializeCurrentSchema } = await import('../src/db/schema')
const { seedDefaultModelProvider, getDefaultProviderSnapshot } = await import('../src/repositories/modelProviders')
const { getModelHealth, invalidateModelHealthCache, streamModel, ModelProviderError } = await import(
  '../src/llm/adapter'
)

const originalFetch = globalThis.fetch

function upstream(parts: Uint8Array[], status = 200, headers: Record<string, string> = {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream', ...headers } },
  )
}

beforeAll(() => {
  initializeCurrentSchema(db)
  seedDefaultModelProvider()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  invalidateModelHealthCache()
})

describe('OpenAI-compatible 上游流', () => {
  it('合并并发健康探测、缓存结果，并支持强制刷新和失效', async () => {
    let requests = 0
    globalThis.fetch = (async () => {
      requests += 1
      await Bun.sleep(10)
      return Response.json({ data: [{ id: 'cached-model' }] })
    }) as typeof fetch

    const provider = getDefaultProviderSnapshot()
    const [first, concurrent] = await Promise.all([getModelHealth(provider), getModelHealth(provider)])
    expect(requests).toBe(1)
    expect(first).toEqual(concurrent)
    expect(first.models).toEqual(['cached-model'])

    expect(await getModelHealth(provider)).toEqual(first)
    expect(requests).toBe(1)

    const refreshed = await getModelHealth(provider, { force: true })
    expect(requests).toBe(2)
    expect(refreshed.online).toBe(true)

    invalidateModelHealthCache(provider.providerId)
    await getModelHealth(provider)
    expect(requests).toBe(3)

    await getModelHealth({ ...provider, name: '已重命名 Provider' })
    expect(requests).toBe(4)
  })

  it('处理 UTF-8 分片、reasoning、usage 和严格 DONE', async () => {
    const raw = [
      'data: {"choices":[{"delta":{"reasoning_content":"先判断"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"雨夜"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":60,"completion_tokens_details":{"reasoning_tokens":8}}}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const bytes = new TextEncoder().encode(raw)
    globalThis.fetch = (() =>
      Promise.resolve(
        upstream([bytes.slice(0, 83), bytes.slice(83, 157), bytes.slice(157)], 200, { 'x-request-id': 'upstream-1' }),
      )) as typeof fetch
    const chunks = []
    for await (const chunk of streamModel({
      system: 'system',
      messages: [],
      signal: new AbortController().signal,
      provider: getDefaultProviderSnapshot(),
    }))
      chunks.push(chunk)
    expect(chunks).toContainEqual({ type: 'metadata', requestId: 'upstream-1' })
    expect(chunks).toContainEqual({ type: 'reasoning', text: '先判断' })
    expect(chunks).toContainEqual({ type: 'text', text: '雨夜' })
    expect(chunks).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 60, reasoningTokens: 8 },
    })
  })

  it('EOF 前没有 DONE 时拒绝把截断内容当作成功', async () => {
    const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"半句"}}]}\n\n')
    globalThis.fetch = (() => Promise.resolve(upstream([bytes]))) as typeof fetch
    try {
      for await (const _chunk of streamModel({
        system: '',
        messages: [],
        signal: new AbortController().signal,
        provider: getDefaultProviderSnapshot(),
      })) {
        // Drain the stream.
      }
      throw new Error('expected stream to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError)
      expect((error as InstanceType<typeof ModelProviderError>).code).toBe('MODEL_STREAM_CLOSED')
    }
  })

  it('保留 429 的 Retry-After 与 Provider 请求 ID', async () => {
    const body = new TextEncoder().encode('{"error":{"message":"rate limited"}}')
    globalThis.fetch = (() =>
      Promise.resolve(upstream([body], 429, { 'retry-after': '2', 'x-request-id': 'rate-1' }))) as typeof fetch
    try {
      for await (const _chunk of streamModel({
        system: '',
        messages: [],
        signal: new AbortController().signal,
        provider: getDefaultProviderSnapshot(),
      })) {
        // Drain the stream.
      }
      throw new Error('expected stream to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError)
      expect((error as InstanceType<typeof ModelProviderError>).code).toBe('MODEL_RATE_LIMIT')
      expect((error as InstanceType<typeof ModelProviderError>).retryAfterMs).toBe(2_000)
      expect((error as InstanceType<typeof ModelProviderError>).requestId).toBe('rate-1')
    }
  })

  it('连接阶段超时返回稳定错误码', async () => {
    globalThis.fetch = ((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })) as typeof fetch
    try {
      for await (const _chunk of streamModel({
        system: '',
        messages: [],
        signal: new AbortController().signal,
        provider: getDefaultProviderSnapshot(),
      })) {
        // Drain the stream.
      }
      throw new Error('expected stream to fail')
    } catch (error) {
      expect((error as InstanceType<typeof ModelProviderError>).code).toBe('MODEL_CONNECT_TIMEOUT')
    }
  })

  it('响应头到达但没有首 token 时超时', async () => {
    globalThis.fetch = ((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )) as typeof fetch
    try {
      for await (const _chunk of streamModel({
        system: '',
        messages: [],
        signal: new AbortController().signal,
        provider: getDefaultProviderSnapshot(),
      })) {
        // Drain the stream.
      }
      throw new Error('expected stream to fail')
    } catch (error) {
      expect((error as InstanceType<typeof ModelProviderError>).code).toBe('MODEL_FIRST_TOKEN_TIMEOUT')
    }
  })

  it('首 token 后长时间没有活动时触发空闲超时', async () => {
    globalThis.fetch = ((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"开头"}}]}\n\n'))
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )) as typeof fetch
    try {
      for await (const _chunk of streamModel({
        system: '',
        messages: [],
        signal: new AbortController().signal,
        provider: getDefaultProviderSnapshot(),
      })) {
        // Drain the stream.
      }
      throw new Error('expected stream to fail')
    } catch (error) {
      expect((error as InstanceType<typeof ModelProviderError>).code).toBe('MODEL_IDLE_TIMEOUT')
    }
  })

  it('用户取消优先映射为 GENERATION_CANCELLED', async () => {
    const external = new AbortController()
    globalThis.fetch = ((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )) as typeof fetch
    setTimeout(() => external.abort(), 10)
    try {
      for await (const _chunk of streamModel({
        system: '',
        messages: [],
        signal: external.signal,
        provider: getDefaultProviderSnapshot(),
      })) {
        // Drain the stream.
      }
      throw new Error('expected stream to fail')
    } catch (error) {
      expect((error as InstanceType<typeof ModelProviderError>).code).toBe('GENERATION_CANCELLED')
    }
  })
})
