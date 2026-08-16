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

function request(app: Express, url: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    let body = ''
    const headers = new Map<string, string | number | readonly string[]>()
    const req = { method: 'GET', url, headers: {}, connection: {}, socket: {} }
    const res = {
      statusCode: 200,
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
        resolve({ status: this.statusCode, body })
      },
    }
    app(req as never, res as never, reject)
  })
}

describe('Express 5 路由', () => {
  it('把异步 handler 的拒绝交给统一错误中间件', async () => {
    const response = await request(createTestApp(), '/api/runtime')
    expect(response.status).toBe(503)
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'ASYNC_ROUTE_FAILED' } })
  })
})
