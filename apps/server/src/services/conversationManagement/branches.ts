import { db } from '../../db/connection'
import { getReplyCandidatesForActiveLeaf, mapMessage, parseJson } from '../../repositories/conversations'
import { estimateTokens } from '../prompt/contextCache'
import { requireConversation } from './guards'

type Row = Record<string, unknown>

function activePathIds(conversationId: string, activeLeafMessageId: string) {
  if (!activeLeafMessageId) return []
  const rows = db
    .query(`
      WITH RECURSIVE active_path AS (
        SELECT id, parent_message_id, tree_depth
        FROM messages WHERE id = ? AND conversation_id = ?
        UNION ALL
        SELECT parent.id, parent.parent_message_id, parent.tree_depth
        FROM messages parent
        JOIN active_path ON parent.id = active_path.parent_message_id
        WHERE parent.conversation_id = ?
      )
      SELECT id FROM active_path ORDER BY tree_depth ASC
    `)
    .all(activeLeafMessageId, conversationId, conversationId) as Row[]
  return rows.map((row) => String(row.id))
}

function latestForkSource(conversationId: string) {
  const row = db
    .query(`
      SELECT payload_json FROM conversation_events
      WHERE conversation_id = ? AND kind = 'conversation_forked'
      ORDER BY created_at DESC LIMIT 1
    `)
    .get(conversationId) as Row | null
  if (!row) return null
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {})
  return {
    sourceConversationId: payload.sourceConversationId ? String(payload.sourceConversationId) : undefined,
    sourceMessageId: payload.sourceMessageId ? String(payload.sourceMessageId) : undefined,
    childConversationId: payload.childConversationId ? String(payload.childConversationId) : undefined,
  }
}

export function getConversationBranches(conversationId: string) {
  const conversation = requireConversation(conversationId)
  const activeLeaf = String(conversation.active_leaf_message_id || '')
  const activeIds = new Set(activePathIds(conversationId, activeLeaf))
  const rows = db
    .query(`
      SELECT
        message.*,
        (
          SELECT COUNT(*) FROM messages child
          WHERE child.conversation_id = message.conversation_id
            AND child.parent_message_id = message.id
        ) AS child_count,
        (
          SELECT COUNT(*) FROM messages sibling
          WHERE sibling.conversation_id = message.conversation_id
            AND (
              sibling.parent_message_id = message.parent_message_id
              OR (sibling.parent_message_id IS NULL AND message.parent_message_id IS NULL)
            )
            AND (sibling.created_at < message.created_at OR (sibling.created_at = message.created_at AND sibling.id <= message.id))
        ) AS sibling_index
      FROM messages message
      WHERE message.conversation_id = ?
      ORDER BY message.tree_depth ASC, message.created_at ASC, message.id ASC
    `)
    .all(conversationId) as Row[]
  const nodes = rows.map((row) => ({
    message: mapMessage(row),
    parentMessageId: row.parent_message_id ? String(row.parent_message_id) : null,
    depth: Number(row.tree_depth || 0),
    childCount: Number(row.child_count || 0),
    siblingIndex: Number(row.sibling_index || 1),
    onActivePath: activeIds.has(String(row.id)),
    isActiveLeaf: String(row.id) === activeLeaf,
  }))
  return {
    activePathIds: Array.from(activeIds),
    nodes,
    branchPoints: nodes
      .filter((node) => node.childCount > 1)
      .map((node) => ({ messageId: node.message.id, childCount: node.childCount })),
    source: latestForkSource(conversationId),
  }
}

export function getReplyCandidateComparison(conversationId: string) {
  const conversation = requireConversation(conversationId)
  const candidates = getReplyCandidatesForActiveLeaf(conversationId, String(conversation.active_leaf_message_id || ''))
  const activeParentMessageId = candidates[0]?.message?.parentMessageId || null
  return {
    activeParentMessageId,
    candidates: candidates.map((candidate, index) => {
      const content = String(candidate.message?.content || '')
      return {
        ...candidate,
        siblingIndex: index + 1,
        estimatedTokens: estimateTokens(content),
        contentPreview: content.length > 240 ? `${content.slice(0, 240)}...` : content,
      }
    }),
  }
}
