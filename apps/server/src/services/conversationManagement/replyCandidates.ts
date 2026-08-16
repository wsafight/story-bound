import { db, nowIso } from '../../db/connection'
import type { SelectReplyCandidateInput } from '../../domain/schemas'
import { getMessageRow, mapMessage, parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { type ConversationRow, requireCheckpoint } from './guards'

function directChildCount(conversationId: string, messageId: string) {
  const row = db
    .query('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND parent_message_id = ?')
    .get(conversationId, messageId) as ConversationRow
  return Number(row.count || 0)
}

export function selectReplyCandidate(conversationId: string, input: SelectReplyCandidateInput) {
  return db.transaction(() => {
    const { conversation } = requireCheckpoint(conversationId, input.expectedLeafMessageId, input.expectedCheckpointId)
    const active = getMessageRow(input.expectedLeafMessageId)
    if (
      !active ||
      active.conversation_id !== conversationId ||
      active.sender === 'player' ||
      !active.parent_message_id
    ) {
      throw new AppError(409, 'REPLY_CANDIDATES_UNAVAILABLE', '只能切换最后一轮人物回复')
    }
    const candidate = getMessageRow(input.messageId)
    if (
      !candidate ||
      candidate.conversation_id !== conversationId ||
      candidate.sender === 'player' ||
      candidate.parent_message_id !== active.parent_message_id
    ) {
      throw new AppError(422, 'REPLY_CANDIDATE_INVALID', '候选回复不属于当前轮次')
    }
    if (candidate.id === active.id) {
      return {
        activeLeafMessageId: conversation.active_leaf_message_id,
        activeCheckpointId: conversation.active_checkpoint_id,
        state: parseJson<Record<string, unknown>>(conversation.state_json, {}),
        abilities: parseJson<Array<Record<string, unknown>>>(conversation.ability_snapshot_json, []),
        modSnapshot: parseJson<Record<string, unknown>>(conversation.mod_snapshot_json, {}),
        message: mapMessage(candidate),
        updatedAt: conversation.updated_at,
      }
    }
    if (
      directChildCount(conversationId, String(active.id)) > 0 ||
      directChildCount(conversationId, String(candidate.id)) > 0
    ) {
      throw new AppError(409, 'REPLY_CANDIDATE_HAS_CONTINUATION', '这条候选已经继续推进，不能直接切换')
    }
    if (!candidate.runtime_checkpoint_id) {
      throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '候选回复缺少运行时检查点')
    }
    const checkpoint = db
      .query('SELECT * FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
      .get(String(candidate.runtime_checkpoint_id), conversationId) as ConversationRow | null
    if (!checkpoint) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法读取候选回复的故事检查点')

    const timestamp = nowIso()
    db.query(`
      UPDATE conversations
      SET active_leaf_message_id = ?, active_checkpoint_id = ?, state_json = ?,
          ability_snapshot_json = ?, mod_snapshot_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(candidate.id),
      String(checkpoint.id),
      String(checkpoint.state_json),
      String(checkpoint.ability_snapshot_json),
      String(checkpoint.mod_snapshot_json || '{}'),
      timestamp,
      conversationId,
    )

    return {
      activeLeafMessageId: String(candidate.id),
      activeCheckpointId: String(checkpoint.id),
      state: parseJson<Record<string, unknown>>(checkpoint.state_json, {}),
      abilities: parseJson<Array<Record<string, unknown>>>(checkpoint.ability_snapshot_json, []),
      modSnapshot: parseJson<Record<string, unknown>>(checkpoint.mod_snapshot_json, {}),
      message: mapMessage(candidate),
      updatedAt: timestamp,
    }
  })()
}
