import { db } from '../db/connection'
import { getConversationRow } from '../repositories/conversations'
import { assemblePrompt, collectPromptContributions } from '../runtime/storyboundRuntime'
import { AppError } from '../shared/errors'
import { getModSnapshot } from './modService'
import { buildBaseModelMessages } from './prompt/assembly'
import { estimateTokens } from './prompt/contextCache'
import type { Row } from './prompt/types'

export { estimateTokens } from './prompt/contextCache'
export type { ContextEstimate } from './prompt/types'

export async function buildModelMessages(conversationId: string, playerMessageId: string, checkpointId?: string) {
  const activeMods = getModSnapshot(conversationId, checkpointId)
  const request = { conversationId, playerMessageId, activeMods }
  const contributions = await collectPromptContributions(request)
  const result = await assemblePrompt(request, () =>
    buildBaseModelMessages(conversationId, playerMessageId, contributions),
  )
  const actualTokens =
    estimateTokens(result.system) +
    result.messages.reduce((total, message) => total + estimateTokens(message.content) + 4, 0)
  if (actualTokens > result.contextEstimate.requestBudget) {
    throw new AppError(422, 'CONTEXT_BUDGET_EXCEEDED', '插件处理后的提示词超过当前模型上下文', {
      segment: '插件提示词',
      estimatedTokens: actualTokens,
      budget: result.contextEstimate.requestBudget,
    })
  }
  result.contextEstimate.estimatedTokens = actualTokens
  return result
}

export async function getContextPreview(conversationId: string) {
  const conversation = getConversationRow(conversationId)
  if (!conversation?.active_leaf_message_id) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
  const leaf = db
    .query('SELECT id, parent_message_id, sender FROM messages WHERE id = ? AND conversation_id = ?')
    .get(String(conversation.active_leaf_message_id), conversationId) as Row | null
  const player =
    leaf?.sender === 'player'
      ? leaf
      : leaf?.parent_message_id
        ? (db
            .query("SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND sender = 'player'")
            .get(String(leaf.parent_message_id), conversationId) as Row | null)
        : null
  if (!player) {
    return { available: false, reason: '发送第一条玩家消息后可查看上下文预算' }
  }
  const result = await buildModelMessages(
    conversationId,
    String(player.id),
    conversation.active_checkpoint_id ? String(conversation.active_checkpoint_id) : undefined,
  )
  return {
    available: true,
    estimate: result.contextEstimate,
    prompt: {
      system: result.system,
      messages: result.messages,
      contributions: result.contributions,
    },
  }
}
