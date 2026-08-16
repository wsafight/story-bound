import { createRuntimeStateSchema } from '@storybound/shared/schemas'
import { config } from '../../config'
import { db, newId } from '../../db/connection'
import { getConversationRow } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'

export type ConversationRow = Record<string, unknown>
const runtimeStateSchema = createRuntimeStateSchema({ maxMessageChars: config.maxMessageChars })

export function requireConversation(conversationId: string) {
  const conversation = getConversationRow(conversationId)
  if (!conversation || conversation.status === 'trashed') {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个存档')
  }
  return conversation
}

export function assertNoGeneration(conversationId: string) {
  const active = db
    .query("SELECT id FROM generations WHERE conversation_id = ? AND status IN ('accepted', 'streaming')")
    .get(conversationId)
  if (active) throw new AppError(409, 'GENERATION_ACTIVE', '生成回复时不能修改存档')
}

export function requireCheckpoint(conversationId: string, expectedLeafMessageId: string, expectedCheckpointId: string) {
  const conversation = requireConversation(conversationId)
  if (conversation.status !== 'active') throw new AppError(409, 'CONVERSATION_NOT_ACTIVE', '这个存档当前不能修改')
  if (
    conversation.active_leaf_message_id !== expectedLeafMessageId ||
    conversation.active_checkpoint_id !== expectedCheckpointId
  ) {
    throw new AppError(409, 'CONVERSATION_CHANGED', '剧情已经变化，请刷新后重试')
  }
  assertNoGeneration(conversationId)
  const checkpoint = db
    .query('SELECT * FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
    .get(expectedCheckpointId, conversationId) as ConversationRow | null
  if (!checkpoint) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法读取当前故事检查点')
  return { conversation, checkpoint }
}

export function writeStateCheckpoint(input: {
  conversationId: string
  parentCheckpointId: string
  anchorMessageId: string
  checkpoint: ConversationRow
  state: Record<string, unknown>
  timestamp: string
}) {
  const checkpointId = newId()
  const parsedState = runtimeStateSchema.safeParse(input.state)
  if (!parsedState.success) throw new AppError(422, 'STATE_INVALID', '故事状态格式不正确')
  const stateJson = JSON.stringify(parsedState.data)
  db.query(`
    INSERT INTO runtime_checkpoints (
      id, conversation_id, parent_checkpoint_id, anchor_message_id,
      state_json, ability_snapshot_json, mod_snapshot_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    checkpointId,
    input.conversationId,
    input.parentCheckpointId,
    input.anchorMessageId,
    stateJson,
    String(input.checkpoint.ability_snapshot_json),
    String(input.checkpoint.mod_snapshot_json || '{}'),
    input.timestamp,
  )
  db.query('UPDATE conversations SET active_checkpoint_id = ?, state_json = ?, updated_at = ? WHERE id = ?').run(
    checkpointId,
    stateJson,
    input.timestamp,
    input.conversationId,
  )
  return checkpointId
}

export function insertConversationEvent(input: {
  conversationId: string
  anchorMessageId: string | null
  checkpointId: string | null
  kind: string
  payload: Record<string, unknown>
  timestamp: string
}) {
  const eventId = newId()
  db.query(`
    INSERT INTO conversation_events (
      id, conversation_id, anchor_message_id, runtime_checkpoint_id, kind, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    input.conversationId,
    input.anchorMessageId,
    input.checkpointId,
    input.kind,
    JSON.stringify(input.payload),
    input.timestamp,
  )
  return {
    id: eventId,
    conversationId: input.conversationId,
    anchorMessageId: input.anchorMessageId,
    checkpointId: input.checkpointId,
    kind: input.kind,
    payload: input.payload,
    createdAt: input.timestamp,
  }
}
