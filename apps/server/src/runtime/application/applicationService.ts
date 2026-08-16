import { type Context, Service } from '@deepseek-ai/cordis'
import type { BackgroundTasksService } from '../backgroundRuntime'
import type { StoryboundRuntimeAdminService } from '../businessRuntime'
import type { StoryboundLlmService, StoryboundSchedulerService } from '../infrastructureRuntime'
import type { StoryboundDatabaseService } from './databaseService'
import type { StoryboundHttpService } from './httpService'
import type { ApplicationRuntimeDependencies, ApplicationRuntimeState } from './types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    application: StoryboundApplicationService
  }
}

export class StoryboundApplicationService extends Service {
  private currentState: ApplicationRuntimeState = 'starting'
  private stopTask: Promise<void> | null = null
  readonly startedAt = new Date().toISOString()

  constructor(
    ctx: Context,
    private readonly dependencies: ApplicationRuntimeDependencies,
    readonly databaseRuntime: StoryboundDatabaseService,
    readonly httpRuntime: StoryboundHttpService,
    readonly llmRuntime: StoryboundLlmService,
    readonly schedulerRuntime: StoryboundSchedulerService,
    readonly backgroundRuntime: BackgroundTasksService,
    readonly runtimeAdmin: StoryboundRuntimeAdminService,
  ) {
    super(ctx, 'application')
  }

  get state() {
    return this.currentState
  }

  async start() {
    if (this.currentState === 'active') return
    this.currentState = 'starting'
    try {
      this.databaseRuntime.start()
      await this.dependencies.startTrustedMods()
      const metrics = await this.dependencies.startMonitoring()
      this.runtimeAdmin.setGenerationMetrics(metrics || null)
      this.backgroundRuntime.start()
      await this.httpRuntime.start()
      this.currentState = 'active'
    } catch (error) {
      this.currentState = 'failed'
      await this.stop().catch(() => undefined)
      this.currentState = 'failed'
      throw error
    }
  }

  stop() {
    if (this.stopTask) return this.stopTask
    this.stopTask = this.performStop()
    return this.stopTask
  }

  private async performStop() {
    if (this.currentState === 'stopped') return
    this.currentState = 'stopping'
    const failures: unknown[] = []
    try {
      this.dependencies.cancelAllGenerations()
    } catch (error) {
      failures.push(error)
    }
    try {
      await this.httpRuntime.stop()
    } catch (error) {
      failures.push(error)
    }
    try {
      await this.backgroundRuntime.stop()
    } catch (error) {
      failures.push(error)
    }
    try {
      this.runtimeAdmin.setGenerationMetrics(null)
      await this.dependencies.stopMonitoring()
    } catch (error) {
      failures.push(error)
    }
    try {
      await this.dependencies.stopTrustedMods()
    } catch (error) {
      failures.push(error)
    }
    this.schedulerRuntime.reset()
    this.llmRuntime.dispose()
    try {
      this.databaseRuntime.stop()
    } catch (error) {
      failures.push(error)
    }
    this.currentState = 'stopped'
    if (failures.length) throw new AggregateError(failures, 'Storybound application shutdown failed')
  }

  forceStop() {
    try {
      this.dependencies.cancelAllGenerations()
    } catch {
      // The process deadline is already exhausted; continue releasing resources.
    }
    try {
      this.httpRuntime.forceStop()
    } finally {
      this.schedulerRuntime.reset()
      this.llmRuntime.dispose()
      try {
        this.databaseRuntime.stop()
      } catch {
        // The caller will terminate the process after this best-effort cleanup.
      }
    }
    this.currentState = 'stopped'
  }
}
