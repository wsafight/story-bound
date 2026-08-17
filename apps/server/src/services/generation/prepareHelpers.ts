import { createHash } from 'node:crypto'
import { db, newId, nowIso } from '../../db/connection'
import { getConversationRow } from '../../repositories/conversations'
import { getDefaultProviderSnapshot, type ModelProviderSnapshot } from '../../repositories/modelProviders'
import { AppError } from '../../shared/errors'
import type { Row } from './types'

export function requireConversation(conversationId: string) {
  const row = getConversationRow(conversationId)
  if (!row || row.status === 'trashed') throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
  if (row.status !== 'active') throw new AppError(409, 'CONVERSATION_NOT_ACTIVE', '这个对话当前不能继续')
  return row
}

export function assertExpectedLeaf(conversation: Row, expectedLeafId: string) {
  if (conversation.active_leaf_message_id !== expectedLeafId) {
    throw new AppError(409, 'CONVERSATION_CHANGED', '剧情已在其他位置更新，请刷新后重试')
  }
}

export function assertNoActiveGeneration(conversationId: string) {
  const active = db
    .query("SELECT id FROM generations WHERE conversation_id = ? AND status IN ('accepted', 'streaming')")
    .get(conversationId)
  if (active) throw new AppError(409, 'GENERATION_ACTIVE', '当前对话正在生成回复')
}

export function requireActiveChapter(conversation: Row) {
  const chapter = db
    .query("SELECT id FROM chapters WHERE id = ? AND status = 'active'")
    .get(String(conversation.current_chapter_id)) as Row | null
  if (!chapter) throw new AppError(409, 'CHAPTER_NOT_ACTIVE', '当前章节已经结束')
  return String(chapter.id)
}

function nextAttempt(playerMessageId: string) {
  const row = db
    .query('SELECT COALESCE(MAX(attempt), 0) AS attempt FROM generations WHERE player_message_id = ?')
    .get(playerMessageId) as Row
  return Number(row.attempt) + 1
}

function providerForConversation(conversation: Row): ModelProviderSnapshot {
  try {
    const snapshot = JSON.parse(String(conversation.model_config_json)) as ModelProviderSnapshot
    if (snapshot.providerId && snapshot.credentialRef && snapshot.baseUrl && snapshot.model) return snapshot
  } catch {
    // Older conversations are upgraded to the current default on their next generation.
  }
  return getDefaultProviderSnapshot()
}

export function getConversationProviderSnapshot(conversationId: string) {
  const conversation = getConversationRow(conversationId)
  if (!conversation || conversation.status === 'trashed')
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
  return providerForConversation(conversation)
}

export function insertGeneration(input: {
  generationId?: string
  conversationId: string
  playerMessageId: string
  expectedLeafId: string
  expectedCheckpointId: string
  attempt?: number
}) {
  const generationId = input.generationId || newId()
  const conversation = requireConversation(input.conversationId)
  const provider = providerForConversation(conversation)
  db.query(`
    INSERT INTO generations (
      id, conversation_id, player_message_id, attempt, model, status,
      expected_leaf_id, expected_checkpoint_id, created_at, provider_id, provider_config_json
    ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)
  `).run(
    generationId,
    input.conversationId,
    input.playerMessageId,
    input.attempt ?? nextAttempt(input.playerMessageId),
    provider.model,
    input.expectedLeafId,
    input.expectedCheckpointId,
    nowIso(),
    provider.providerId,
    JSON.stringify(provider),
  )
  return generationId
}

function requestHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function findOperationReceipt(conversationId: string, operationId: string, payload: unknown) {
  const hash = requestHash(payload)
  const existing = db
    .query('SELECT request_hash, result_json FROM operation_receipts WHERE conversation_id = ? AND operation_id = ?')
    .get(conversationId, operationId) as Row | null
  if (existing) {
    if (existing.request_hash !== hash) throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', '操作编号已经用于其他请求')
    return JSON.parse(String(existing.result_json)) as { generationId: string; playerMessageId: string }
  }
  return null
}

export function recordOperationReceipt(
  conversationId: string,
  operationId: string,
  type: string,
  payload: unknown,
  result: object,
) {
  const hash = requestHash(payload)
  db.query(`
    INSERT INTO operation_receipts (conversation_id, operation_id, type, request_hash, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(conversationId, operationId, type, hash, JSON.stringify(result), nowIso())
}

export function reserveOperation(
  conversationId: string,
  operationId: string,
  type: string,
  payload: unknown,
  result: object,
) {
  const existing = findOperationReceipt(conversationId, operationId, payload)
  if (existing) return existing
  recordOperationReceipt(conversationId, operationId, type, payload, result)
  return null
}
