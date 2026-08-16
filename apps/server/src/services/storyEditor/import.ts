import type { Database } from 'bun:sqlite'
import { db } from '../../db/connection'
import { AppError } from '../../shared/errors'
import { createStoryDraft } from './drafts'
import { inspectNormalizedStoryImport, normalizeStoryImport } from './importAdapters'

export function inspectStoryImport(input: unknown) {
  return inspectNormalizedStoryImport(normalizeStoryImport(input))
}

export function importStoryPackage(input: unknown, database: Database = db) {
  const inspected = inspectStoryImport(input)
  if (inspected.report.dryRun) return { report: inspected.report }
  if (!inspected.report.canImport || !inspected.draft) {
    throw new AppError(422, 'STORY_IMPORT_INVALID', '故事卡包不能导入', { report: inspected.report })
  }
  const story = createStoryDraft(inspected.draft, database)
  return { report: { ...inspected.report, dryRun: false }, story }
}
