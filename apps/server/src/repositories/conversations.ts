import type { Database } from 'bun:sqlite'
import type { StoryMessage } from '@storybound/shared'
import { db } from '../db/connection'

export type Row = Record<string, unknown>

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function getConversationRow(conversationId: string, database: Database = db) {
  return database.query('SELECT * FROM conversations WHERE id = ?').get(conversationId) as Row | null
}

export function getMessageRow(messageId: string, database: Database = db) {
  return database.query('SELECT * FROM messages WHERE id = ?').get(messageId) as Row | null
}

export function getGenerationRow(generationId: string, database: Database = db) {
  return database.query('SELECT * FROM generations WHERE id = ?').get(generationId) as Row | null
}

export function getCurrentPathPage(
  conversationId: string,
  options: { before?: string; limit?: number } = {},
  knownActiveLeafMessageId?: string,
  database: Database = db,
) {
  const activeLeafMessageId =
    knownActiveLeafMessageId || String(getConversationRow(conversationId, database)?.active_leaf_message_id || '')
  if (!activeLeafMessageId) return { rows: [] as Row[], hasMore: false, nextCursor: null as string | null }
  const limit = Math.min(100, Math.max(1, options.limit || 80))
  let startId = activeLeafMessageId
  if (options.before) {
    const cursor = database
      .query('SELECT parent_message_id FROM messages WHERE id = ? AND conversation_id = ?')
      .get(options.before, conversationId) as Row | null
    if (!cursor) return { rows: [] as Row[], hasMore: false, nextCursor: null as string | null }
    if (!cursor.parent_message_id) return { rows: [] as Row[], hasMore: false, nextCursor: null as string | null }
    startId = String(cursor.parent_message_id)
  }
  const newestFirst = database
    .query(`
    WITH RECURSIVE page_path AS (
      SELECT m.*, 0 AS path_depth
      FROM messages m WHERE m.id = ? AND m.conversation_id = ?
      UNION ALL
      SELECT parent.*, page_path.path_depth + 1
      FROM messages parent
      JOIN page_path ON parent.id = page_path.parent_message_id
      WHERE parent.conversation_id = ? AND page_path.path_depth < ?
    )
    SELECT * FROM page_path ORDER BY path_depth ASC LIMIT ?
  `)
    .all(startId, conversationId, conversationId, limit, limit + 1) as Row[]
  const hasMore = newestFirst.length > limit
  const rows = newestFirst.slice(0, limit).reverse()
  return { rows, hasMore, nextCursor: rows.length ? String(rows[0].id) : null }
}

export function mapMessage(row: Row): StoryMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    chapterId: String(row.chapter_id),
    parentMessageId: row.parent_message_id ? String(row.parent_message_id) : null,
    generationId: row.generation_id ? String(row.generation_id) : null,
    sender: row.sender as StoryMessage['sender'],
    characterId: row.character_id ? String(row.character_id) : null,
    inputMode: (row.input_mode || null) as StoryMessage['inputMode'],
    content: String(row.content),
    createdAt: String(row.created_at),
  }
}

export function getReplyCandidatesForActiveLeaf(
  conversationId: string,
  activeLeafMessageId?: string,
  database: Database = db,
) {
  const leafId =
    activeLeafMessageId || String(getConversationRow(conversationId, database)?.active_leaf_message_id || '')
  if (!leafId) return []
  const leaf = database
    .query('SELECT * FROM messages WHERE id = ? AND conversation_id = ?')
    .get(leafId, conversationId) as Row | null
  if (!leaf || leaf.sender === 'player' || !leaf.parent_message_id) return []

  const rows = database
    .query(`
    SELECT
      candidate.*,
      generation.attempt AS generation_attempt,
      generation.model AS generation_model,
      generation.status AS generation_status,
      (
        SELECT COUNT(*)
        FROM messages child
        WHERE child.conversation_id = candidate.conversation_id
          AND child.parent_message_id = candidate.id
      ) AS child_count
    FROM messages candidate
    LEFT JOIN generations generation ON generation.id = candidate.generation_id
    WHERE candidate.conversation_id = ?
      AND candidate.parent_message_id = ?
      AND candidate.sender IN ('character', 'narrator')
      AND candidate.runtime_checkpoint_id IS NOT NULL
    ORDER BY candidate.created_at ASC, candidate.id ASC
  `)
    .all(conversationId, String(leaf.parent_message_id)) as Row[]

  return rows.map((row) => {
    const childCount = Number(row.child_count || 0)
    const isActive = row.id === leaf.id
    const generationStatus = row.generation_status ? String(row.generation_status) : null
    const blockedReason = isActive
      ? 'ACTIVE'
      : childCount > 0
        ? 'HAS_CONTINUATION'
        : generationStatus && generationStatus !== 'completed'
          ? 'GENERATION_NOT_COMPLETED'
          : null
    return {
      id: row.id,
      message: mapMessage(row),
      checkpointId: row.runtime_checkpoint_id,
      generationId: row.generation_id,
      attempt:
        row.generation_attempt === null || row.generation_attempt === undefined ? null : Number(row.generation_attempt),
      model: row.generation_model,
      isActive,
      selectable: !blockedReason,
      blockedReason,
      childCount,
      createdAt: row.created_at,
    }
  })
}

export function mapConversationEvent(row: Row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    anchorMessageId: row.anchor_message_id,
    checkpointId: row.runtime_checkpoint_id,
    kind: row.kind,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    createdAt: row.created_at,
  }
}

export function getConversationEventsForMessages(
  conversationId: string,
  messageIds: string[],
  database: Database = db,
) {
  if (messageIds.length === 0) return []
  const placeholders = messageIds.map(() => '?').join(', ')
  return (
    database
      .query(`
    SELECT * FROM conversation_events
    WHERE conversation_id = ? AND anchor_message_id IN (${placeholders})
    ORDER BY created_at ASC
  `)
      .all(conversationId, ...messageIds) as Row[]
  ).map(mapConversationEvent)
}

export function getConversationView(conversationId: string, database: Database = db) {
  const row = getConversationRow(conversationId, database)
  if (!row || row.status === 'trashed') return null
  const card = parseJson<Record<string, unknown>>(row.card_snapshot_json, {})
  const player = parseJson<Record<string, unknown>>(row.player_snapshot_json, {})
  const abilities = parseJson<Array<Record<string, unknown>>>(row.ability_snapshot_json, [])
  const scene = parseJson<Record<string, unknown>>(row.scene_snapshot_json, {})
  const state = parseJson<Record<string, unknown>>(row.state_json, {})
  const messagePage = getCurrentPathPage(conversationId, {}, String(row.active_leaf_message_id || ''), database)
  const path = messagePage.rows.map(mapMessage)
  const events = getConversationEventsForMessages(
    conversationId,
    path.map((message) => String(message.id)),
    database,
  )
  const replyCandidates = getReplyCandidatesForActiveLeaf(
    conversationId,
    String(row.active_leaf_message_id || ''),
    database,
  )
  const activeGeneration = database
    .query(`
    SELECT id, status, error_code FROM generations
    WHERE conversation_id = ? AND status IN ('accepted', 'streaming')
    ORDER BY created_at DESC LIMIT 1
  `)
    .get(conversationId) as Row | null
  const currentChapter = row.current_chapter_id
    ? (database
        .query('SELECT id, number, title, status FROM chapters WHERE id = ? AND conversation_id = ?')
        .get(String(row.current_chapter_id), conversationId) as Row | null)
    : null

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeLeafMessageId: row.active_leaf_message_id,
    activeCheckpointId: row.active_checkpoint_id,
    story: card,
    player,
    abilities,
    scene,
    state,
    messages: path,
    events,
    replyCandidates,
    messagePage: { hasMore: messagePage.hasMore, nextCursor: messagePage.nextCursor },
    activeGeneration: activeGeneration
      ? { id: activeGeneration.id, status: activeGeneration.status, errorCode: activeGeneration.error_code }
      : null,
    currentChapter: currentChapter
      ? {
          id: currentChapter.id,
          number: Number(currentChapter.number),
          title: currentChapter.title,
          status: currentChapter.status,
        }
      : null,
  }
}

export class ConversationsRepository {
  constructor(private readonly database: Database) {}

  row(conversationId: string) {
    return getConversationRow(conversationId, this.database)
  }

  view(conversationId: string) {
    return getConversationView(conversationId, this.database)
  }

  pathPage(conversationId: string, options: { before?: string; limit?: number }, activeLeafMessageId?: string) {
    return getCurrentPathPage(conversationId, options, activeLeafMessageId, this.database)
  }

  replyCandidates(conversationId: string, activeLeafMessageId?: string) {
    return getReplyCandidatesForActiveLeaf(conversationId, activeLeafMessageId, this.database)
  }

  events(conversationId: string, messageIds: string[]) {
    return getConversationEventsForMessages(conversationId, messageIds, this.database)
  }
}
