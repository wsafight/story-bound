import { describe, expect, it } from 'bun:test'
import { Context } from '@deepseek-ai/cordis'
import { BackgroundTasksService } from '../src/runtime/backgroundRuntime'
import type { StoryboundLlmService } from '../src/runtime/infrastructureRuntime'
import { generationMonitoringPlugin } from '../src/runtime/monitoringRuntime'
import { StoryboundRuntimeService } from '../src/runtime/storyboundRuntime'

async function runtimeContext() {
  const ctx = new Context()
  const core = ctx.plugin({
    name: 'test-monitoring-core',
    apply(child) {
      new StoryboundRuntimeService(child)
    },
  })
  await core.await()
  return { ctx, core }
}

describe('Cordis architecture services', () => {
  it('监控插件聚合生成耗时、Token 和失败码', async () => {
    const { ctx, core } = await runtimeContext()
    const monitoring = ctx.plugin(generationMonitoringPlugin)
    await monitoring.await()
    const base = {
      conversationId: 'conversation-1',
      playerMessageId: 'message-1',
      kind: 'send' as const,
    }
    await ctx.parallel('storybound/generation/accepted', {
      ...base,
      generationId: 'generation-1',
      phase: 'accepted',
      occurredAt: '2026-08-16T00:00:00.000Z',
    })
    await ctx.parallel('storybound/generation/completed', {
      ...base,
      generationId: 'generation-1',
      phase: 'completed',
      occurredAt: '2026-08-16T00:00:02.000Z',
      messageId: 'message-2',
      finishReason: 'stop',
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 20, reasoningTokens: 4 },
    })
    await ctx.parallel('storybound/generation/accepted', {
      ...base,
      generationId: 'generation-2',
      phase: 'accepted',
      occurredAt: '2026-08-16T00:00:03.000Z',
    })
    await ctx.parallel('storybound/generation/failed', {
      ...base,
      generationId: 'generation-2',
      phase: 'failed',
      occurredAt: '2026-08-16T00:00:04.000Z',
      code: 'MODEL_RATE_LIMIT',
      retryable: true,
    })

    expect(ctx.generationMetrics.snapshot()).toEqual({
      accepted: 2,
      completed: 1,
      failed: 1,
      active: 0,
      successRate: 0.5,
      averageDurationMs: 1500,
      tokens: { input: 120, output: 30, cacheRead: 20, reasoning: 4 },
      failuresByCode: { MODEL_RATE_LIMIT: 1 },
    })
    await monitoring.dispose()
    expect(ctx.get('generationMetrics')).toBeUndefined()
    await core.dispose()
  })

  it('Fiber 卸载后停止后台维护、健康检查和自动备份 timer', async () => {
    const ctx = new Context()
    const runs = { maintenance: 0, health: 0, backup: 0 }
    let tasks: BackgroundTasksService | null = null
    const fiber = ctx.plugin({
      name: 'test-background-tasks',
      apply(child) {
        tasks = new BackgroundTasksService(
          child,
          {
            pruneHealthCache: () => {
              runs.maintenance += 1
            },
          } as unknown as StoryboundLlmService,
          {
            list: () => [{ id: 'provider-1' }],
            health: async () => {
              runs.health += 1
            },
          },
          {
            create: () => {
              runs.backup += 1
            },
          },
          { maintenanceIntervalMs: 5, providerHealthIntervalMs: 5, autoBackupIntervalMs: 5 },
        )
        tasks.start()
      },
    })
    await fiber.await()
    await Bun.sleep(30)
    expect(runs.maintenance).toBeGreaterThan(0)
    expect(runs.health).toBeGreaterThan(0)
    expect(runs.backup).toBeGreaterThan(0)

    await fiber.dispose()
    const stoppedAt = { ...runs }
    await Bun.sleep(20)
    expect(runs).toEqual(stoppedAt)
    expect(tasks?.status().failures).toBe(0)
  })

  it('后台健康检查不重叠，并在 Fiber 卸载时等待在途任务', async () => {
    const ctx = new Context()
    let active = 0
    let maximumActive = 0
    let completed = 0
    const fiber = ctx.plugin({
      name: 'test-background-in-flight-task',
      apply(child) {
        const tasks = new BackgroundTasksService(
          child,
          { pruneHealthCache: () => undefined } as unknown as StoryboundLlmService,
          {
            list: () => [{ id: 'provider-1' }],
            health: async () => {
              active += 1
              maximumActive = Math.max(maximumActive, active)
              await Bun.sleep(30)
              active -= 1
              completed += 1
            },
          },
          { create: () => undefined },
          { maintenanceIntervalMs: 0, providerHealthIntervalMs: 5, autoBackupIntervalMs: 0 },
        )
        tasks.start()
      },
    })
    await fiber.await()
    await Bun.sleep(20)

    await fiber.dispose()

    expect(maximumActive).toBe(1)
    expect(active).toBe(0)
    expect(completed).toBe(1)
  })
})
