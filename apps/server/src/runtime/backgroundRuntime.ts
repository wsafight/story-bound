import { type Context, Service } from '@deepseek-ai/cordis'
import { config } from '../config'
import type { StoryboundLlmService } from './infrastructureRuntime'

interface BackgroundBackups {
  create(): unknown
}

interface BackgroundProviders {
  list(): Array<{ id: string }>
  health(providerId: string): Promise<unknown>
}

export interface BackgroundTaskOptions {
  maintenanceIntervalMs: number
  providerHealthIntervalMs: number
  autoBackupIntervalMs: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    backgroundTasks: BackgroundTasksService
  }
}

export class BackgroundTasksService extends Service {
  private disposeEffect: (() => Promise<void>) | null = null
  private providerPoll: Promise<void> | null = null
  private statusValue = {
    maintenanceRuns: 0,
    healthRuns: 0,
    backupRuns: 0,
    failures: 0,
    lastMaintenanceAt: null as string | null,
    lastHealthAt: null as string | null,
    lastBackupAt: null as string | null,
  }

  constructor(
    ctx: Context,
    private readonly llm: StoryboundLlmService,
    private readonly providers: BackgroundProviders,
    private readonly backups: BackgroundBackups,
    private readonly options: BackgroundTaskOptions = {
      maintenanceIntervalMs: config.runtimeMaintenanceIntervalMs,
      providerHealthIntervalMs: config.providerHealthIntervalMs,
      autoBackupIntervalMs: config.autoBackupIntervalMs,
    },
  ) {
    super(ctx, 'backgroundTasks')
  }

  start() {
    if (this.disposeEffect) return
    this.disposeEffect = this.ctx.effect(() => {
      const timers: Array<ReturnType<typeof setInterval>> = []
      const schedule = (callback: () => void, intervalMs: number) => {
        if (intervalMs <= 0) return
        const timer = setInterval(callback, intervalMs)
        timer.unref()
        timers.push(timer)
      }
      schedule(() => {
        this.llm.pruneHealthCache()
        this.statusValue.maintenanceRuns += 1
        this.statusValue.lastMaintenanceAt = new Date().toISOString()
      }, this.options.maintenanceIntervalMs)
      schedule(() => this.startProviderPoll(), this.options.providerHealthIntervalMs)
      schedule(() => this.createBackup(), this.options.autoBackupIntervalMs)
      return async () => {
        for (const timer of timers) clearInterval(timer)
        await this.providerPoll
      }
    }, 'storybound background timers')
  }

  async stop() {
    const dispose = this.disposeEffect
    this.disposeEffect = null
    if (dispose) await dispose()
  }

  private startProviderPoll() {
    if (this.providerPoll) return
    const task = this.pollProviders()
    this.providerPoll = task
    void task.finally(() => {
      if (this.providerPoll === task) this.providerPoll = null
    })
  }

  private async pollProviders() {
    try {
      await Promise.all(this.providers.list().map((provider) => this.providers.health(provider.id)))
      this.statusValue.healthRuns += 1
      this.statusValue.lastHealthAt = new Date().toISOString()
    } catch (error) {
      this.statusValue.failures += 1
      this.ctx.logger('storybound').warn('provider health background task failed', error)
    }
  }

  private createBackup() {
    try {
      this.backups.create()
      this.statusValue.backupRuns += 1
      this.statusValue.lastBackupAt = new Date().toISOString()
    } catch (error) {
      this.statusValue.failures += 1
      this.ctx.logger('storybound').warn('automatic backup task failed', error)
    }
  }

  status() {
    return {
      enabled: {
        maintenance: this.options.maintenanceIntervalMs > 0,
        providerHealth: this.options.providerHealthIntervalMs > 0,
        autoBackup: this.options.autoBackupIntervalMs > 0,
      },
      ...this.statusValue,
    }
  }
}
