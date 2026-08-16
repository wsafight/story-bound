import type { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import type { Server } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import {
  type ApplicationRuntimeDependencies,
  createStoryboundApplicationRuntime,
} from '../src/runtime/applicationRuntime'
import { StoryboundRuntimeService } from '../src/runtime/storyboundRuntime'

function runtimeHarness(options: { failHttpStart?: boolean } = {}) {
  const calls: string[] = []
  const server = {} as Server
  const dependencies: ApplicationRuntimeDependencies = {
    database: {} as Database,
    initializeDatabase: () => calls.push('database:start'),
    closeDatabase: () => calls.push('database:stop'),
    startTrustedMods: async () => {
      calls.push('mods:start')
    },
    stopTrustedMods: async () => {
      calls.push('mods:stop')
    },
    startMonitoring: async () => {
      calls.push('monitoring:start')
    },
    stopMonitoring: async () => {
      calls.push('monitoring:stop')
    },
    cancelAllGenerations: () => calls.push('generations:cancel'),
    startHttpServer: async () => {
      calls.push('http:start')
      if (options.failHttpStart) throw new Error('listen failed')
      return server
    },
    stopHttpServer: async (value) => {
      expect(value).toBe(server)
      calls.push('http:stop')
    },
    forceStopHttpServer: () => calls.push('http:force-stop'),
  }
  return { calls, dependencies }
}

async function createContext() {
  const ctx = new Context()
  const core = ctx.plugin({
    name: 'test-storybound-core',
    apply(child) {
      new StoryboundRuntimeService(child)
    },
  })
  await core.await()
  return { ctx, core }
}

describe('Cordis application runtime', () => {
  it('按依赖顺序启动并按资源顺序完整释放', async () => {
    const { calls, dependencies } = runtimeHarness()
    const { ctx, core } = await createContext()
    const runtime = createStoryboundApplicationRuntime(dependencies)
    const fiber = ctx.plugin(runtime.plugin)
    await fiber.await()

    expect(calls).toEqual(['database:start', 'mods:start', 'monitoring:start', 'http:start'])
    expect(runtime.getService()?.state).toBe('active')
    expect(ctx.database.connection).toBe(dependencies.database)
    expect(ctx.http.server).not.toBeNull()
    expect(ctx.llm).toBeDefined()
    expect(ctx.stories).toBeDefined()
    expect(ctx.conversations).toBeDefined()
    expect(ctx.providers).toBeDefined()
    expect(ctx.backups).toBeDefined()
    expect(ctx.runtimeAdmin).toBeDefined()
    expect(ctx.backgroundTasks.status().enabled.maintenance).toBe(true)
    expect((await ctx.runtimeAdmin.status()).metrics).toEqual({
      accepted: 0,
      completed: 0,
      failed: 0,
      active: 0,
      successRate: null,
      averageDurationMs: null,
      tokens: { input: 0, output: 0, cacheRead: 0, reasoning: 0 },
      failuresByCode: {},
    })
    const release = ctx.scheduler.acquire()
    expect(release).not.toBeNull()
    expect(ctx.scheduler.acquire()).toBeNull()
    release?.()

    await fiber.dispose()
    expect(calls).toEqual([
      'database:start',
      'mods:start',
      'monitoring:start',
      'http:start',
      'generations:cancel',
      'http:stop',
      'monitoring:stop',
      'mods:stop',
      'database:stop',
    ])
    expect(runtime.getService()).toBeNull()
    await core.dispose()
  })

  it('HTTP 启动失败时回滚已启动的 MOD 和数据库', async () => {
    const { calls, dependencies } = runtimeHarness({ failHttpStart: true })
    const { ctx, core } = await createContext()
    const runtime = createStoryboundApplicationRuntime(dependencies)
    const fiber = ctx.plugin(runtime.plugin)

    await expect(fiber.await()).rejects.toThrow('listen failed')
    expect(calls).toEqual([
      'database:start',
      'mods:start',
      'monitoring:start',
      'http:start',
      'generations:cancel',
      'monitoring:stop',
      'mods:stop',
      'database:stop',
    ])
    expect(runtime.getService()).toBeNull()
    await fiber.dispose()
    await core.dispose()
  })
})
