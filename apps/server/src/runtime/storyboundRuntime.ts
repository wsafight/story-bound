import { Context, type Fiber, type FiberState, type Plugin, Service } from '@deepseek-ai/cordis'
import cordisPackage from '@deepseek-ai/cordis/package.json'
import type { ContextEstimate } from '../services/prompt/types'

export interface PromptAssemblyRequest {
  conversationId: string
  playerMessageId: string
  activeMods: Record<string, { version: string; config: Record<string, unknown> }>
}

export interface PromptContribution {
  id: string
  modId: string
  label: string
  section: 'rules' | 'memory' | 'director' | 'style'
  priority: number
  required: boolean
  content: string
}

export interface PromptContributionResult extends PromptContribution {
  estimatedTokens: number
  included: boolean
  reason?: 'budget_exceeded'
}

export interface PromptAssembly {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  characterId: string | null
  contextEstimate: ContextEstimate
  contributions: PromptContributionResult[]
}

interface GenerationLifecycleBase {
  generationId: string
  conversationId: string
  playerMessageId: string
  kind: 'send' | 'retry' | 'regenerate' | 'edit'
  occurredAt: string
}

export type GenerationLifecycleEvent =
  | (GenerationLifecycleBase & { phase: 'accepted' })
  | (GenerationLifecycleBase & { phase: 'started' })
  | (GenerationLifecycleBase & {
      phase: 'completed'
      messageId: string
      finishReason: string
      usage: {
        inputTokens: number | null
        outputTokens: number | null
        cacheReadTokens: number | null
        reasoningTokens: number | null
      }
    })
  | (GenerationLifecycleBase & { phase: 'failed'; code: string; retryable: boolean })

type LifecycleEvent<P extends GenerationLifecycleEvent['phase']> = Extract<GenerationLifecycleEvent, { phase: P }>

export interface StoryboundRuntimeStatus {
  engine: 'Cordis'
  version: string
  plugins: Array<{ name: string; instances: number; states: string[] }>
  generations: { active: number; completed: number; failed: number }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    storybound: StoryboundRuntimeService
  }

  interface Events {
    'storybound/prompt/assemble'(
      request: PromptAssemblyRequest,
      next: () => Promise<PromptAssembly>,
    ): Promise<PromptAssembly>
    'storybound/prompt/contribute'(
      request: PromptAssemblyRequest,
      contribute: (contribution: PromptContribution) => void,
    ): void | Promise<void>
    'storybound/generation/accepted'(event: LifecycleEvent<'accepted'>): void | Promise<void>
    'storybound/generation/started'(event: LifecycleEvent<'started'>): void | Promise<void>
    'storybound/generation/completed'(event: LifecycleEvent<'completed'>): void | Promise<void>
    'storybound/generation/failed'(event: LifecycleEvent<'failed'>): void | Promise<void>
  }
}

const fiberStateNames = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'] as const

export class StoryboundRuntimeService extends Service {
  private generations = { active: 0, completed: 0, failed: 0 }

  constructor(ctx: Context) {
    super(ctx, 'storybound')
  }

  async assemblePrompt(request: PromptAssemblyRequest, base: () => PromptAssembly | Promise<PromptAssembly>) {
    return await this.ctx.waterfall('storybound/prompt/assemble', request, async () => await base())
  }

  async collectPromptContributions(request: PromptAssemblyRequest) {
    const contributions: PromptContribution[] = []
    await this.ctx.parallel('storybound/prompt/contribute', request, (contribution) => {
      if (contributions.length >= 32) throw new Error('单次提示词贡献不能超过 32 项')
      if (!contribution.id || !contribution.modId || !contribution.label || !contribution.content.trim()) {
        throw new Error('MOD 提交了不完整的提示词贡献')
      }
      if (contribution.content.length > 12_000) throw new Error(`MOD ${contribution.modId} 的提示词贡献过长`)
      if (contributions.some((item) => item.modId === contribution.modId && item.id === contribution.id)) {
        throw new Error(`MOD ${contribution.modId} 提交了重复的提示词贡献 ${contribution.id}`)
      }
      contributions.push({ ...contribution, content: contribution.content.trim() })
    })
    return contributions.sort((left, right) => right.priority - left.priority || left.modId.localeCompare(right.modId))
  }

  async publishGeneration(event: GenerationLifecycleEvent) {
    if (event.phase === 'accepted') this.generations.active += 1
    if (event.phase === 'completed') {
      this.generations.active = Math.max(0, this.generations.active - 1)
      this.generations.completed += 1
    }
    if (event.phase === 'failed') {
      this.generations.active = Math.max(0, this.generations.active - 1)
      this.generations.failed += 1
    }

    try {
      if (event.phase === 'accepted') await this.ctx.parallel('storybound/generation/accepted', event)
      if (event.phase === 'started') await this.ctx.parallel('storybound/generation/started', event)
      if (event.phase === 'completed') await this.ctx.parallel('storybound/generation/completed', event)
      if (event.phase === 'failed') await this.ctx.parallel('storybound/generation/failed', event)
    } catch (error) {
      this.ctx.logger('storybound').warn('generation lifecycle plugin failed', error)
    }
  }

  status(): StoryboundRuntimeStatus {
    const plugins = [...this.ctx.registry.values()]
      .map((runtime) => {
        const fibers = [...runtime.fibers]
        return {
          name: runtime.name || 'anonymous',
          instances: fibers.length,
          states: fibers.map((fiber) => fiberStateNames[fiber.state as FiberState] || 'unknown'),
        }
      })
      .filter((plugin) => plugin.instances > 0)
    return {
      engine: 'Cordis',
      version: cordisPackage.version,
      plugins,
      generations: { ...this.generations },
    }
  }
}

const rootContext = new Context()
const corePlugin = {
  name: 'storybound-core',
  apply(ctx: Context) {
    new StoryboundRuntimeService(ctx)
  },
}
const coreFiber = rootContext.plugin(corePlugin)
const runtimeReady = coreFiber.await()
const extensionFibers = new Set<Fiber>()
const managedFibers = new Map<string, { fiber: Fiber; startedAt: string }>()

async function service() {
  await runtimeReady
  return rootContext.storybound
}

export async function assemblePrompt(
  request: PromptAssemblyRequest,
  base: () => PromptAssembly | Promise<PromptAssembly>,
) {
  return (await service()).assemblePrompt(request, base)
}

export async function collectPromptContributions(request: PromptAssemblyRequest) {
  return (await service()).collectPromptContributions(request)
}

export async function publishGenerationLifecycle(event: GenerationLifecycleEvent) {
  await (await service()).publishGeneration(event)
}

export async function getStoryboundRuntimeStatus() {
  return (await service()).status()
}

export async function startStoryboundRuntime() {
  await runtimeReady
}

export async function installStoryboundPlugin(plugin: Plugin, config?: unknown) {
  await runtimeReady
  const fiber = rootContext.registry.plugin(plugin, config)
  extensionFibers.add(fiber)
  try {
    await fiber.await()
    return fiber
  } catch (error) {
    extensionFibers.delete(fiber)
    await fiber.dispose()
    throw error
  }
}

export async function disposeStoryboundPlugin(fiber: Fiber) {
  extensionFibers.delete(fiber)
  for (const [id, managed] of managedFibers) {
    if (managed.fiber === fiber) managedFibers.delete(id)
  }
  await fiber.dispose()
}

export async function setManagedStoryboundPlugin(id: string, plugin: Plugin, enabled: boolean, config?: unknown) {
  await runtimeReady
  const current = managedFibers.get(id)
  if (!enabled) {
    if (!current) return
    managedFibers.delete(id)
    extensionFibers.delete(current.fiber)
    await current.fiber.dispose()
    return
  }
  if (current) {
    await current.fiber.update(config)
    return
  }
  const fiber = await installStoryboundPlugin(plugin, config)
  managedFibers.set(id, { fiber, startedAt: new Date().toISOString() })
}

export function getManagedStoryboundPluginStatus(id: string) {
  const current = managedFibers.get(id)
  if (!current) return { loaded: false, state: 'disposed', effectCount: 0, startedAt: null }
  return {
    loaded: true,
    state: fiberStateNames[current.fiber.state as FiberState] || 'unknown',
    effectCount: current.fiber.getEffects().length,
    startedAt: current.startedAt,
  }
}

export async function stopManagedStoryboundPlugins() {
  const fibers = [...managedFibers.values()].map((managed) => managed.fiber)
  managedFibers.clear()
  for (const fiber of fibers) extensionFibers.delete(fiber)
  await Promise.all(fibers.map((fiber) => fiber.dispose()))
}

export async function disposeStoryboundRuntime() {
  await Promise.all([...extensionFibers].map((fiber) => fiber.dispose()))
  extensionFibers.clear()
  managedFibers.clear()
  await coreFiber.dispose()
}
