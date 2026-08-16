import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ModelAdapterRuntime } from '../../llm/adapter'
import { getProviderCredential } from '../../repositories/modelProviders'
import { BackgroundTasksService } from '../backgroundRuntime'
import { installBusinessServices } from '../businessRuntime'
import { StoryboundLlmService, StoryboundSchedulerService } from '../infrastructureRuntime'
import { StoryboundApplicationService } from './applicationService'
import { StoryboundDatabaseService } from './databaseService'
import { StoryboundHttpService } from './httpService'
import type { ApplicationRuntimeDependencies } from './types'

export function createStoryboundApplicationRuntime(dependencies: ApplicationRuntimeDependencies) {
  let service: StoryboundApplicationService | null = null
  const plugin: Plugin = {
    name: 'storybound-application',
    inject: ['storybound'],
    async apply(ctx: Context) {
      const databaseRuntime = new StoryboundDatabaseService(ctx, dependencies)
      const llmRuntime = new StoryboundLlmService(
        ctx,
        new ModelAdapterRuntime((credentialRef) => getProviderCredential(credentialRef, databaseRuntime.connection)),
      )
      const schedulerRuntime = new StoryboundSchedulerService(ctx)
      const business = installBusinessServices(ctx, databaseRuntime.connection, llmRuntime, schedulerRuntime)
      const backgroundRuntime = new BackgroundTasksService(ctx, llmRuntime, business.providers, business.backups)
      business.runtimeAdmin.setBackground(backgroundRuntime)
      const httpRuntime = new StoryboundHttpService(ctx, dependencies)
      const application = new StoryboundApplicationService(
        ctx,
        dependencies,
        databaseRuntime,
        httpRuntime,
        llmRuntime,
        schedulerRuntime,
        backgroundRuntime,
        business.runtimeAdmin,
      )
      service = application
      try {
        await application.start()
      } catch (error) {
        service = null
        throw error
      }
      return async () => {
        try {
          await application.stop()
        } finally {
          if (service === application) service = null
        }
      }
    },
  }
  return { plugin, getService: () => service }
}
