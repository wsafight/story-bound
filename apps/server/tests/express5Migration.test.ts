import { describe, expect, it } from 'bun:test'
import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { createApp } from '../src/app'
import { AppError } from '../src/shared/errors'

function createTestApp() {
  const ctx = {
    runtimeAdmin: {
      status: async () => {
        throw new AppError(503, 'ASYNC_ROUTE_FAILED', 'async route failed')
      },
      listMods: () => [],
    },
  } as unknown as Context
  return createApp(ctx)
}

function request(app: Express, url: string, headersInput: Record<string, string> = {}) {
  return new Promise<{
    status: number
    body: string
    headers: Map<string, string | number | readonly string[]>
  }>((resolve, reject) => {
    let body = ''
    const headers = new Map<string, string | number | readonly string[]>()
    const req = { method: 'GET', url, headers: headersInput, connection: {}, socket: {} }
    const res = {
      statusCode: 200,
      locals: {},
      setHeader(name: string, value: string | number | readonly string[]) {
        headers.set(name.toLowerCase(), value)
      },
      getHeader(name: string) {
        return headers.get(name.toLowerCase())
      },
      removeHeader(name: string) {
        headers.delete(name.toLowerCase())
      },
      end(chunk?: string | Uint8Array) {
        if (chunk) body += chunk.toString()
        resolve({ status: this.statusCode, body, headers })
      },
    }
    app(req as never, res as never, reject)
  })
}

describe('Express 5 路由', () => {
  it('把异步 handler 的拒绝交给统一错误中间件', async () => {
    const originalError = console.error
    const logs: string[] = []
    console.error = ((message: string) => logs.push(message)) as typeof console.error
    try {
      const response = await request(createTestApp(), '/api/runtime?token=secret', {
        authorization: 'Bearer secret-token',
        'x-storybound-request-id': 'test-request-1',
      })
      expect(response.status).toBe(503)
      expect(response.headers.get('x-storybound-request-id')).toBe('test-request-1')
      expect(JSON.parse(response.body)).toMatchObject({
        error: { code: 'ASYNC_ROUTE_FAILED', requestId: 'test-request-1' },
      })
      expect(logs).toHaveLength(1)
      const log = JSON.parse(logs[0]) as Record<string, unknown>
      expect(log).toMatchObject({
        level: 'error',
        message: 'http_request_failed',
        route: '/api/runtime',
        method: 'GET',
        status: 503,
        errorCode: 'ASYNC_ROUTE_FAILED',
        appRequestId: 'test-request-1',
      })
      expect(typeof log.durationMs).toBe('number')
      expect(logs[0]).not.toContain('secret-token')
      expect(logs[0]).not.toContain('token=secret')
    } finally {
      console.error = originalError
    }
  })
})
