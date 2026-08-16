import { afterEach, describe, expect, it } from 'bun:test'
import { apiContracts } from '@storybound/shared'
import { QueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../src/app/apiClient'
import { apiQueryOptions } from '../src/app/apiQueries'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('浏览器 API 请求', () => {
  it('由 React Query 合并并发 GET、命中 TTL，并在失效后重新读取', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let requests = 0
    globalThis.fetch = (async () => {
      requests += 1
      await Bun.sleep(10)
      return Response.json({ access: { protected: requests === 1, networkExposed: false } })
    }) as typeof fetch
    const options = apiQueryOptions({ ...apiContracts.access(), path: '/api/cache-test' })

    const [first, concurrent] = await Promise.all([queryClient.fetchQuery(options), queryClient.fetchQuery(options)])
    expect(first).toEqual({ access: { protected: true, networkExposed: false } })
    expect(concurrent).toEqual(first)
    expect((await queryClient.fetchQuery(options)).access.protected).toBe(true)
    expect(requests).toBe(1)

    await queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: 'none' })
    expect((await queryClient.fetchQuery(options)).access.protected).toBe(false)
  })

  it('把 Query 取消信号传给 fetch', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let requestSignal: AbortSignal | null = null
    globalThis.fetch = ((_path, init) => {
      requestSignal = init?.signal instanceof AbortSignal ? init.signal : null
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason))
      })
    }) as typeof fetch
    const options = apiQueryOptions({ ...apiContracts.access(), path: '/api/slow' })
    const request = queryClient.fetchQuery(options).catch(() => undefined)

    await Promise.resolve()
    await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true })
    await request
    expect(requestSignal?.aborted).toBe(true)
  })

  it('把服务端错误转换为 ApiError', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({ error: { code: 'NOT_FOUND', message: '不存在' } }, { status: 404 }),
      )) as typeof fetch

    try {
      await api({ ...apiContracts.access(), path: '/api/missing' })
      throw new Error('expected api to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('NOT_FOUND')
    }
  })

  it('拒绝不符合共享契约的成功响应', async () => {
    globalThis.fetch = (() => Promise.resolve(Response.json({ version: 'wrong' }))) as typeof fetch

    await expect(api({ ...apiContracts.access(), path: '/api/version' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    })
  })
})
