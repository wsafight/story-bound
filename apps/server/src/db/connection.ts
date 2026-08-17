import { Database } from 'bun:sqlite'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config'
import { makeDirectoryPrivate, makeFilePrivate, usePrivateFileCreationMask } from '../security/filePermissions'

usePrivateFileCreationMask()
mkdirSync(path.dirname(config.dbPath), { recursive: true, mode: 0o700 })
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
if (!process.env.DATA_DIR) makeDirectoryPrivate(config.dataDir)

export const db = new Database(config.dbPath, { create: true })
makeFilePrivate(config.dbPath)

const queryMetricsStorage = new AsyncLocalStorage<{ queryCount: number }>()
const originalQuery = db.query.bind(db) as typeof db.query
;(db as unknown as { query: typeof db.query }).query = ((...args: Parameters<typeof db.query>) => {
  const metrics = queryMetricsStorage.getStore()
  if (metrics) metrics.queryCount += 1
  return originalQuery(...args)
}) as typeof db.query

db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA busy_timeout = 5000')
db.exec('PRAGMA synchronous = NORMAL')
makeFilePrivate(`${config.dbPath}-wal`)
makeFilePrivate(`${config.dbPath}-shm`)

export function nowIso() {
  return new Date().toISOString()
}

export function newId() {
  return crypto.randomUUID()
}

export async function measureDbQueries<T>(fn: () => T | Promise<T>) {
  const metrics = { queryCount: 0 }
  const startedAt = Date.now()
  const result = await queryMetricsStorage.run(metrics, fn)
  return {
    result,
    metrics: {
      dbQueryCount: metrics.queryCount,
      durationMs: Math.max(0, Date.now() - startedAt),
    },
  }
}
