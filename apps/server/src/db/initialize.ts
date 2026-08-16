import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config'
import { seedDefaultModelProvider } from '../repositories/modelProviders'
import { makeDirectoryPrivate, makeFilePrivate } from '../security/filePermissions'
import { db } from './connection'
import { initializeCurrentSchema } from './schema'
import { seedBuiltInStories } from './seed'

function secureBackupDirectory(backupDir: string) {
  makeDirectoryPrivate(backupDir)
  for (const entry of readdirSync(backupDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.sqlite')) makeFilePrivate(path.join(backupDir, entry.name))
  }
}

export function initializeDatabase() {
  const backupDir = path.join(config.dataDir, 'backups')
  if (existsSync(backupDir)) secureBackupDirectory(backupDir)
  initializeCurrentSchema(db)
  seedDefaultModelProvider()
  seedBuiltInStories(db)
  db.query(`
    UPDATE generations
    SET status = 'failed', error_code = 'SERVER_RESTARTED', finished_at = ?
    WHERE status IN ('accepted', 'streaming')
  `).run(new Date().toISOString())
}
