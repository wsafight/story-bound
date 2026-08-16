import { db, nowIso } from '../../db/connection'
import type { PinMemoryInput } from '../../domain/schemas'
import { parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { type ConversationRow, insertConversationEvent, requireCheckpoint, writeStateCheckpoint } from './guards'

export function togglePinnedMemory(conversationId: string, input: PinMemoryInput) {
  return db.transaction(() => {
    const { conversation, checkpoint } = requireCheckpoint(
      conversationId,
      input.expectedLeafMessageId,
      input.expectedCheckpointId,
    )
    const message = db
      .query(`
      WITH RECURSIVE active_path AS (
        SELECT id, parent_message_id, content FROM messages WHERE id = ? AND conversation_id = ?
        UNION ALL
        SELECT parent.id, parent.parent_message_id, parent.content
        FROM messages parent JOIN active_path ON parent.id = active_path.parent_message_id
        WHERE parent.conversation_id = ?
      )
      SELECT id, content FROM active_path WHERE id = ?
    `)
      .get(input.expectedLeafMessageId, conversationId, conversationId, input.messageId) as ConversationRow | null
    if (!message) throw new AppError(422, 'MESSAGE_NOT_ON_ACTIVE_PATH', '只能固定当前故事路径上的消息')

    const state = parseJson<Record<string, any>>(conversation.state_json, {})
    const custom = state.custom && typeof state.custom === 'object' ? { ...state.custom } : {}
    const current = Array.isArray(custom.pinnedMemories) ? [...custom.pinnedMemories] : []
    const existingIndex = current.findIndex((item: any) => item?.messageId === input.messageId)
    const pinned = existingIndex < 0
    if (pinned) current.push({ messageId: input.messageId, content: String(message.content), createdAt: nowIso() })
    else current.splice(existingIndex, 1)
    custom.pinnedMemories = current.slice(-50)
    state.custom = custom

    const timestamp = nowIso()
    const checkpointId = writeStateCheckpoint({
      conversationId,
      parentCheckpointId: input.expectedCheckpointId,
      anchorMessageId: input.expectedLeafMessageId,
      checkpoint,
      state,
      timestamp,
    })
    insertConversationEvent({
      conversationId,
      anchorMessageId: input.expectedLeafMessageId,
      checkpointId,
      kind: pinned ? 'memory_pinned' : 'memory_unpinned',
      payload: {
        messageId: input.messageId,
        summary: String(message.content).slice(0, 140),
      },
      timestamp,
    })
    return { pinned, messageId: input.messageId, activeCheckpointId: checkpointId, state, updatedAt: timestamp }
  })()
}
