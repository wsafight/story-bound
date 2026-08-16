import type { Database } from 'bun:sqlite'
import { type Context, Service } from '@deepseek-ai/cordis'
import { config } from '../../config'
import { createBackup, getBackupPath, listBackups, restoreBackup } from '../../services/backupService'

declare module '@deepseek-ai/cordis' {
  interface Context {
    backups: StoryboundBackupsService
  }
}

export class StoryboundBackupsService extends Service {
  constructor(
    ctx: Context,
    private readonly database: Database,
  ) {
    super(ctx, 'backups')
  }

  list() {
    return listBackups(config.dataDir)
  }

  create() {
    return createBackup(this.database, config.dataDir)
  }

  path(name: string) {
    return getBackupPath(name, config.dataDir)
  }

  restore(name: string) {
    return restoreBackup(name, this.database, config.dataDir, config.dbPath)
  }
}
