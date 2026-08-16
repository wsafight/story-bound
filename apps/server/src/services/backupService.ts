import type { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config'
import { db } from '../db/connection'
import { makeDirectoryPrivate, makeFilePrivate } from '../security/filePermissions'
import { AppError } from '../shared/errors'

const backupNamePattern = /^storybound-\d{8}T\d{6}-[a-f0-9]{8}\.sqlite$/

function backupDirectory(dataDir = config.dataDir) {
  const directory = path.join(dataDir, 'backups')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  makeDirectoryPrivate(directory)
  return directory
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function databaseTables(database: Database, schema = 'main') {
  return database
    .query<{ name: string }, []>(`
    SELECT name FROM ${sqlIdentifier(schema)}.sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
    .all()
    .map((row) => row.name)
}

export function listBackups(dataDir = config.dataDir) {
  const directory = backupDirectory(dataDir)
  return readdirSync(directory)
    .filter((name) => backupNamePattern.test(name))
    .map((name) => {
      const stats = statSync(path.join(directory, name))
      return { name, size: stats.size, createdAt: stats.birthtime.toISOString() }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

export function createBackup(database: Database = db, dataDir = config.dataDir) {
  const directory = backupDirectory(dataDir)
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')
  const name = `storybound-${timestamp}-${crypto.randomUUID().slice(0, 8)}.sqlite`
  const target = path.join(directory, name)
  const temporary = `${target}.tmp`
  try {
    database.exec(`VACUUM INTO ${sqlString(temporary)}`)
    makeFilePrivate(temporary)
    renameSync(temporary, target)
    makeFilePrivate(target)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      /* Nothing to clean up. */
    }
    throw error
  }
  const stats = statSync(target)
  return { name, size: stats.size, createdAt: stats.birthtime.toISOString() }
}

export function getBackupPath(name: string, dataDir = config.dataDir) {
  if (!backupNamePattern.test(name)) throw new AppError(404, 'BACKUP_NOT_FOUND', '没有找到这个备份')
  const target = path.join(backupDirectory(dataDir), name)
  try {
    if (!statSync(target).isFile()) throw new Error('not a file')
    return target
  } catch {
    throw new AppError(404, 'BACKUP_NOT_FOUND', '没有找到这个备份')
  }
}

export function restoreBackup(
  name: string,
  database: Database = db,
  dataDir = config.dataDir,
  databasePath = config.dbPath,
) {
  const backupPath = getBackupPath(name, dataDir)
  const safetyBackup = createBackup(database, dataDir)
  database.exec(`ATTACH DATABASE ${sqlString(backupPath)} AS restore_source`)
  try {
    const check = database.query<{ quick_check: string }, []>('PRAGMA restore_source.quick_check').get()
    if (check?.quick_check !== 'ok') throw new AppError(422, 'BACKUP_INVALID', '备份文件没有通过 SQLite 完整性检查')

    const currentTables = databaseTables(database, 'main')
    const backupTables = new Set(databaseTables(database, 'restore_source'))
    const missing = currentTables.filter((table) => !backupTables.has(table))
    if (missing.length > 0) {
      throw new AppError(422, 'BACKUP_SCHEMA_MISMATCH', `备份缺少当前版本需要的数据表：${missing.join(', ')}`)
    }

    database.exec('PRAGMA foreign_keys = OFF')
    try {
      database.transaction(() => {
        for (const table of [...currentTables].reverse()) {
          database.exec(`DELETE FROM main.${sqlIdentifier(table)}`)
        }
        for (const table of currentTables) {
          database.exec(`INSERT INTO main.${sqlIdentifier(table)} SELECT * FROM restore_source.${sqlIdentifier(table)}`)
        }
      })()
      const foreignKeyIssues = database.query<{ table: string }, []>('PRAGMA foreign_key_check').all()
      if (foreignKeyIssues.length > 0) throw new AppError(422, 'BACKUP_FOREIGN_KEY_INVALID', '备份数据存在外键不一致')
    } finally {
      database.exec('PRAGMA foreign_keys = ON')
    }
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    makeFilePrivate(databasePath)
    try {
      makeFilePrivate(`${databasePath}-wal`)
    } catch {
      /* WAL may not exist after checkpoint. */
    }
    try {
      makeFilePrivate(`${databasePath}-shm`)
    } catch {
      /* SHM may not exist after checkpoint. */
    }
    return { restored: name, safetyBackup, tableCount: currentTables.length }
  } finally {
    database.exec('DETACH DATABASE restore_source')
  }
}
