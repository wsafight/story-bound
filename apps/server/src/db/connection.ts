import { Database } from 'bun:sqlite'
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
