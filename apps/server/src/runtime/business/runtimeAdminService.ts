import { type Context, Service } from '@deepseek-ai/cordis'
import type { UpdateRuntimeModInput } from '../../domain/schemas'
import { listRuntimeMods, updateRuntimeMod } from '../../services/modService'
import { auditPromptProfile, getPromptProfile } from '../../services/promptService'
import type { BackgroundTasksService } from '../backgroundRuntime'
import type { StoryboundSchedulerService } from '../infrastructureRuntime'
import { emptyGenerationMetricsSnapshot, type GenerationMetricsReader } from '../monitoringRuntime'

declare module '@deepseek-ai/cordis' {
  interface Context {
    runtimeAdmin: StoryboundRuntimeAdminService
  }
}

export class StoryboundRuntimeAdminService extends Service {
  private background: BackgroundTasksService | null = null
  private metrics: GenerationMetricsReader | null = null

  constructor(
    ctx: Context,
    private readonly scheduler: StoryboundSchedulerService,
  ) {
    super(ctx, 'runtimeAdmin')
  }

  setBackground(background: BackgroundTasksService) {
    this.background = background
  }

  setGenerationMetrics(metrics: GenerationMetricsReader | null) {
    this.metrics = metrics
  }

  async status() {
    return {
      ...this.ctx.storybound.status(),
      scheduler: this.scheduler.status(),
      metrics: this.metrics?.snapshot() || emptyGenerationMetricsSnapshot(),
      background: this.background?.status() || null,
    }
  }

  listMods() {
    return listRuntimeMods()
  }

  promptProfile() {
    return getPromptProfile()
  }

  promptAudit() {
    return auditPromptProfile()
  }

  updateMod(modId: string, input: UpdateRuntimeModInput) {
    return updateRuntimeMod(modId, input)
  }
}
