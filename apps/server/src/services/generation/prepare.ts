import { db, newId, nowIso } from '../../db/connection'
import type { SendMessageInput } from '../../domain/schemas'
import { getMessageRow } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import {
  assertExpectedLeaf,
  assertNoActiveGeneration,
  insertGeneration,
  requireActiveChapter,
  requireConversation,
  reserveOperation,
} from './prepareHelpers'
import type { PreparedGeneration, Row } from './types'

export function prepareSend(conversationId: string, input: SendMessageInput): PreparedGeneration {
  return db.transaction((): PreparedGeneration => {
    const duplicate = db
      .query('SELECT * FROM messages WHERE conversation_id = ? AND client_message_id = ?')
      .get(conversationId, input.clientMessageId) as Row | null
    if (duplicate) {
      const generation = db
        .query('SELECT * FROM generations WHERE player_message_id = ? ORDER BY attempt DESC LIMIT 1')
        .get(String(duplicate.id)) as Row | null
      if (!generation) throw new AppError(409, 'MESSAGE_ALREADY_SAVED', '这条消息已经保存，可直接重试')
      return {
        id: String(generation.id),
        conversationId,
        playerMessageId: String(duplicate.id),
        kind: 'send',
        duplicate: true,
      }
    }

    const conversation = requireConversation(conversationId)
    assertExpectedLeaf(conversation, input.expectedLeafMessageId)
    assertNoActiveGeneration(conversationId)
    const chapterId = requireActiveChapter(conversation)
    const parentMessageId = String(conversation.active_leaf_message_id)
    const parent = getMessageRow(parentMessageId)
    if (!parent || parent.conversation_id !== conversationId) {
      throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法恢复当前消息路径')
    }
    const playerMessageId = newId()
    const timestamp = nowIso()
    db.query(`
      INSERT INTO messages (
        id, conversation_id, chapter_id, client_message_id, parent_message_id,
        runtime_checkpoint_id, sender, input_mode, content, tree_depth, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'player', ?, ?, ?, ?)
    `).run(
      playerMessageId,
      conversationId,
      chapterId,
      input.clientMessageId,
      parentMessageId,
      String(conversation.active_checkpoint_id),
      input.inputMode,
      input.content,
      Number(parent.tree_depth) + 1,
      timestamp,
    )
    db.query('UPDATE conversations SET active_leaf_message_id = ?, updated_at = ? WHERE id = ?').run(
      playerMessageId,
      timestamp,
      conversationId,
    )
    const generationId = insertGeneration({
      conversationId,
      playerMessageId,
      expectedLeafId: playerMessageId,
      expectedCheckpointId: String(conversation.active_checkpoint_id),
    })
    return { id: generationId, conversationId, playerMessageId, kind: 'send' }
  })()
}

export function prepareRetry(messageId: string, expectedLeafMessageId: string): PreparedGeneration {
  return db.transaction((): PreparedGeneration => {
    const message = getMessageRow(messageId)
    if (!message || message.sender !== 'player')
      throw new AppError(404, 'PLAYER_MESSAGE_NOT_FOUND', '没有找到可重试的玩家消息')
    const conversationId = String(message.conversation_id)
    const conversation = requireConversation(conversationId)
    assertExpectedLeaf(conversation, expectedLeafMessageId)
    if (conversation.active_leaf_message_id !== messageId)
      throw new AppError(409, 'RETRY_NOT_LAST_MESSAGE', '只能重试当前最后一条未回复消息')
    requireActiveChapter(conversation)
    assertNoActiveGeneration(conversationId)
    const generationId = insertGeneration({
      conversationId,
      playerMessageId: messageId,
      expectedLeafId: messageId,
      expectedCheckpointId: String(conversation.active_checkpoint_id),
    })
    return { id: generationId, conversationId, playerMessageId: messageId, kind: 'retry' }
  })()
}

export function prepareRegenerate(
  conversationId: string,
  input: { operationId: string; expectedLeafMessageId: string },
): PreparedGeneration {
  return db.transaction((): PreparedGeneration => {
    const conversation = requireConversation(conversationId)
    assertExpectedLeaf(conversation, input.expectedLeafMessageId)
    requireActiveChapter(conversation)
    assertNoActiveGeneration(conversationId)
    const leaf = getMessageRow(input.expectedLeafMessageId)
    if (!leaf || !['character', 'narrator'].includes(String(leaf.sender)) || !leaf.parent_message_id) {
      throw new AppError(409, 'REGENERATE_NOT_AVAILABLE', '只能重新生成最后一轮人物回复')
    }
    const generationId = newId()
    const prior = reserveOperation(conversationId, input.operationId, 'regenerate', input, {
      generationId,
      playerMessageId: leaf.parent_message_id,
    })
    if (prior)
      return {
        id: prior.generationId,
        conversationId,
        playerMessageId: prior.playerMessageId,
        kind: 'regenerate',
        duplicate: true,
      }
    insertGeneration({
      generationId,
      conversationId,
      playerMessageId: String(leaf.parent_message_id),
      expectedLeafId: String(conversation.active_leaf_message_id),
      expectedCheckpointId: String(conversation.active_checkpoint_id),
    })
    return { id: generationId, conversationId, playerMessageId: String(leaf.parent_message_id), kind: 'regenerate' }
  })()
}

export function prepareEditAndRetry(
  messageId: string,
  input: {
    operationId: string
    clientMessageId: string
    expectedLeafMessageId: string
    content: string
    inputMode: 'dialogue' | 'action' | 'narration'
  },
): PreparedGeneration {
  return db.transaction((): PreparedGeneration => {
    const original = getMessageRow(messageId)
    if (!original || original.sender !== 'player')
      throw new AppError(404, 'PLAYER_MESSAGE_NOT_FOUND', '没有找到可编辑的玩家消息')
    const conversationId = String(original.conversation_id)
    const conversation = requireConversation(conversationId)
    assertExpectedLeaf(conversation, input.expectedLeafMessageId)
    requireActiveChapter(conversation)
    assertNoActiveGeneration(conversationId)
    const leaf = getMessageRow(input.expectedLeafMessageId)
    if (!leaf || leaf.parent_message_id !== messageId || !['character', 'narrator'].includes(String(leaf.sender))) {
      throw new AppError(409, 'EDIT_NOT_AVAILABLE', '只能编辑最后一轮玩家消息')
    }
    const playerMessageId = newId()
    const generationId = newId()
    const prior = reserveOperation(conversationId, input.operationId, 'edit-and-retry', input, {
      generationId,
      playerMessageId,
    })
    if (prior)
      return {
        id: prior.generationId,
        conversationId,
        playerMessageId: prior.playerMessageId,
        kind: 'edit',
        duplicate: true,
      }
    db.query(`
      INSERT INTO messages (
        id, conversation_id, chapter_id, client_message_id, parent_message_id,
        runtime_checkpoint_id, sender, input_mode, content, tree_depth, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'player', ?, ?, ?, ?)
    `).run(
      playerMessageId,
      conversationId,
      String(original.chapter_id),
      input.clientMessageId,
      original.parent_message_id ? String(original.parent_message_id) : null,
      String(original.runtime_checkpoint_id),
      input.inputMode,
      input.content,
      Number(original.tree_depth),
      nowIso(),
    )
    insertGeneration({
      generationId,
      conversationId,
      playerMessageId,
      expectedLeafId: String(conversation.active_leaf_message_id),
      expectedCheckpointId: String(conversation.active_checkpoint_id),
      attempt: 1,
    })
    return { id: generationId, conversationId, playerMessageId, kind: 'edit' }
  })()
}
