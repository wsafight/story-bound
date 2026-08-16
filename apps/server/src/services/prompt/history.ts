import { db } from '../../db/connection'
import type { Row } from './types'

export function ancestorBatch(conversationId: string, startMessageId: string, limit: number) {
  return db
    .query(`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_message_id, sender, input_mode, content, 0 AS path_depth
      FROM messages WHERE id = ? AND conversation_id = ?
      UNION ALL
      SELECT parent.id, parent.parent_message_id, parent.sender, parent.input_mode, parent.content, ancestors.path_depth + 1
      FROM messages parent
      JOIN ancestors ON parent.id = ancestors.parent_message_id
      WHERE parent.conversation_id = ? AND ancestors.path_depth < ?
    )
    SELECT id, parent_message_id, sender, input_mode, content
    FROM ancestors ORDER BY path_depth ASC LIMIT ?
  `)
    .all(startMessageId, conversationId, conversationId, limit - 1, limit) as Row[]
}
