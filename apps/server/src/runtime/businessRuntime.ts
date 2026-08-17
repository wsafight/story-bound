import type { Database } from 'bun:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { StoryboundBackupsService } from './business/backupsService'
import { StoryboundConversationsService } from './business/conversationsService'
import { StoryboundProvidersService } from './business/providersService'
import { StoryboundRuntimeAdminService } from './business/runtimeAdminService'
import { StoryboundStoriesService } from './business/storiesService'
import type { StoryboundLlmService, StoryboundSchedulerService } from './infrastructureRuntime'

export * from './business/backupsService'
export * from './business/conversationsService'
export * from './business/providersService'
export * from './business/runtimeAdminService'
export * from './business/storiesService'

export function installBusinessServices(
  ctx: Context,
  database: Database,
  llm: StoryboundLlmService,
  scheduler: StoryboundSchedulerService,
) {
  const providers = new StoryboundProvidersService(ctx, database, llm)
  const stories = new StoryboundStoriesService(ctx, database, llm, providers)
  const conversations = new StoryboundConversationsService(ctx, database, llm)
  const backups = new StoryboundBackupsService(ctx, database)
  const runtimeAdmin = new StoryboundRuntimeAdminService(ctx, scheduler)
  return { stories, conversations, providers, backups, runtimeAdmin }
}
