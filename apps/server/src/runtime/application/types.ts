import type { Database } from 'bun:sqlite'
import type { Server } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerationMetricsReader } from '../monitoringRuntime'

export interface ApplicationRuntimeDependencies {
  database: Database
  initializeDatabase(): void
  closeDatabase(): void
  startTrustedMods(): Promise<void>
  stopTrustedMods(): Promise<void>
  startMonitoring(): Promise<GenerationMetricsReader | void>
  stopMonitoring(): Promise<void>
  cancelAllGenerations(): void
  startHttpServer(ctx: Context): Promise<Server>
  stopHttpServer(server: Server): Promise<void>
  forceStopHttpServer(server: Server): void
}

export type ApplicationRuntimeState = 'starting' | 'active' | 'stopping' | 'stopped' | 'failed'
