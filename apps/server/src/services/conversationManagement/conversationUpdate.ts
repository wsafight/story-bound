import { db, nowIso } from '../../db/connection'
import type { UpdateConversationInput } from '../../domain/schemas'
import { assertNoGeneration, requireConversation } from './guards'

export function updateConversation(conversationId: string, input: UpdateConversationInput) {
  const conversation = requireConversation(conversationId)
  if (input.status && input.status !== conversation.status) assertNoGeneration(conversationId)
  const title = input.title ?? String(conversation.title)
  const status = input.status ?? String(conversation.status)
  db.query('UPDATE conversations SET title = ?, status = ?, updated_at = ? WHERE id = ?').run(
    title,
    status,
    nowIso(),
    conversationId,
  )
  return { id: conversationId, title, status }
}
