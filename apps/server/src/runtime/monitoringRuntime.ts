import { type Context, type Fiber, type Plugin, Service } from '@deepseek-ai/cordis'
import type { GenerationLifecycleEvent } from './storyboundRuntime'
import { disposeStoryboundPlugin, installStoryboundPlugin } from './storyboundRuntime'

export interface GenerationMetricsSnapshot {
  accepted: number
  completed: number
  failed: number
  active: number
  successRate: number | null
  averageDurationMs: number | null
  tokens: { input: number; output: number; cacheRead: number; reasoning: number }
  failuresByCode: Record<string, number>
}

export interface GenerationMetricsReader {
  snapshot(): GenerationMetricsSnapshot
}

export function emptyGenerationMetricsSnapshot(): GenerationMetricsSnapshot {
  return {
    accepted: 0,
    completed: 0,
    failed: 0,
    active: 0,
    successRate: null,
    averageDurationMs: null,
    tokens: { input: 0, output: 0, cacheRead: 0, reasoning: 0 },
    failuresByCode: {},
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    generationMetrics: GenerationMetricsService
  }
}

export class GenerationMetricsService extends Service {
  private accepted = 0
  private completed = 0
  private failed = 0
  private totalDurationMs = 0
  private readonly startedAt = new Map<string, number>()
  private readonly failuresByCode = new Map<string, number>()
  private readonly tokens = { input: 0, output: 0, cacheRead: 0, reasoning: 0 }

  constructor(ctx: Context) {
    super(ctx, 'generationMetrics')
  }

  record(event: GenerationLifecycleEvent) {
    if (event.phase === 'accepted') {
      this.accepted += 1
      this.startedAt.set(event.generationId, Date.parse(event.occurredAt) || Date.now())
      return
    }
    if (event.phase === 'completed') {
      this.completed += 1
      this.finishDuration(event)
      this.tokens.input += event.usage.inputTokens || 0
      this.tokens.output += event.usage.outputTokens || 0
      this.tokens.cacheRead += event.usage.cacheReadTokens || 0
      this.tokens.reasoning += event.usage.reasoningTokens || 0
      return
    }
    if (event.phase === 'failed') {
      this.failed += 1
      this.finishDuration(event)
      this.failuresByCode.set(event.code, (this.failuresByCode.get(event.code) || 0) + 1)
    }
  }

  private finishDuration(event: GenerationLifecycleEvent) {
    const startedAt = this.startedAt.get(event.generationId)
    this.startedAt.delete(event.generationId)
    if (startedAt !== undefined) {
      this.totalDurationMs += Math.max(0, (Date.parse(event.occurredAt) || Date.now()) - startedAt)
    }
  }

  snapshot(): GenerationMetricsSnapshot {
    const finished = this.completed + this.failed
    return {
      accepted: this.accepted,
      completed: this.completed,
      failed: this.failed,
      active: this.startedAt.size,
      successRate: finished ? this.completed / finished : null,
      averageDurationMs: finished ? Math.round(this.totalDurationMs / finished) : null,
      tokens: { ...this.tokens },
      failuresByCode: Object.fromEntries([...this.failuresByCode].sort(([left], [right]) => left.localeCompare(right))),
    }
  }
}

let monitoringFiber: Fiber | null = null
let currentMetrics: GenerationMetricsService | null = null
export const generationMonitoringPlugin: Plugin = {
  name: 'storybound-generation-monitoring',
  inject: ['storybound'],
  apply(ctx: Context) {
    const metrics = new GenerationMetricsService(ctx)
    currentMetrics = metrics
    ctx.on('storybound/generation/accepted', (event) => metrics.record(event))
    ctx.on('storybound/generation/started', (event) => metrics.record(event))
    ctx.on('storybound/generation/completed', (event) => metrics.record(event))
    ctx.on('storybound/generation/failed', (event) => metrics.record(event))
    return () => {
      if (currentMetrics === metrics) currentMetrics = null
    }
  },
}

export async function startGenerationMonitoring() {
  if (!monitoringFiber) monitoringFiber = await installStoryboundPlugin(generationMonitoringPlugin)
  if (!currentMetrics) throw new Error('Generation monitoring service did not start')
  return currentMetrics
}

export async function stopGenerationMonitoring() {
  const fiber = monitoringFiber
  monitoringFiber = null
  currentMetrics = null
  if (fiber) await disposeStoryboundPlugin(fiber)
}
