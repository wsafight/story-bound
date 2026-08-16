import { type Context, Service } from '@deepseek-ai/cordis'
import type { ApplicationRuntimeDependencies } from './types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    database: StoryboundDatabaseService
  }
}

export class StoryboundDatabaseService extends Service {
  private open = false

  constructor(
    ctx: Context,
    private readonly dependencies: ApplicationRuntimeDependencies,
  ) {
    super(ctx, 'database')
  }

  get connection() {
    return this.dependencies.database
  }

  get ready() {
    return this.open
  }

  start() {
    if (this.open) return
    this.dependencies.initializeDatabase()
    this.open = true
  }

  stop() {
    if (!this.open) return
    this.open = false
    this.dependencies.closeDatabase()
  }
}
