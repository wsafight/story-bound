import { config } from '../../config'
import { db, newId, nowIso } from '../../db/connection'
import { ModelProviderError, normalizeModelError } from '../../llm/adapter'
import { getConversationRow, getMessageRow, mapMessage, parseJson } from '../../repositories/conversations'
import type { ModelProviderSnapshot } from '../../repositories/modelProviders'
import { publishGenerationLifecycle } from '../../runtime/storyboundRuntime'
import { AppError } from '../../shared/errors'
import { applyLongTermMemoryForLeaf } from '../conversationManagement/longTermMemory'
import { withActualInputTokens } from '../prompt/contextCache'
import { degradePromptForContextLimit } from '../prompt/degradation'
import { buildModelMessages } from '../promptBuilder'
import { requireConversation } from './prepareHelpers'
import { abortControllers, getModelStreamer } from './runtimeState'
import type { GenerationEvent, GenerationModelRuntime, PreparedGeneration, Row } from './types'

function duplicateResult(prepared: PreparedGeneration, emit: (event: GenerationEvent) => void) {
  const generation = db.query('SELECT * FROM generations WHERE id = ?').get(prepared.id) as Row | null
  if (!generation) throw new AppError(404, 'GENERATION_NOT_FOUND', '没有找到生成任务')
  emit({
    event: 'accepted',
    data: {
      generationId: prepared.id,
      playerMessageId: prepared.playerMessageId,
      playerMessage: mapMessage(getMessageRow(prepared.playerMessageId)!),
    },
  })
  if (generation.status === 'completed') {
    const message = db.query('SELECT * FROM messages WHERE generation_id = ?').get(prepared.id) as Row
    const conversation = getConversationRow(prepared.conversationId)!
    emit({
      event: 'completed',
      data: {
        generationId: prepared.id,
        message: mapMessage(message),
        activeLeafMessageId: String(conversation.active_leaf_message_id),
        activeCheckpointId: String(conversation.active_checkpoint_id),
        updatedAt: String(conversation.updated_at),
      },
    })
    return
  }
  emit({
    event: 'error',
    data: {
      generationId: prepared.id,
      code: String(generation.error_code || 'GENERATION_ACTIVE'),
      message: generation.status === 'failed' ? '上次生成失败，可以重试' : '这条消息的生成任务仍在处理中',
      retryable: generation.status !== 'cancelled',
    },
  })
}

export async function runGeneration(
  prepared: PreparedGeneration,
  emit: (event: GenerationEvent) => void,
  modelRuntime: GenerationModelRuntime = { stream: (input) => getModelStreamer()(input) },
) {
  if (prepared.duplicate) {
    duplicateResult(prepared, emit)
    return
  }
  await publishGenerationLifecycle({
    phase: 'accepted',
    generationId: prepared.id,
    conversationId: prepared.conversationId,
    playerMessageId: prepared.playerMessageId,
    kind: prepared.kind,
    occurredAt: nowIso(),
  })
  emit({
    event: 'accepted',
    data: {
      generationId: prepared.id,
      playerMessageId: prepared.playerMessageId,
      playerMessage: mapMessage(getMessageRow(prepared.playerMessageId)!),
    },
  })
  const controller = new AbortController()
  abortControllers.set(prepared.id, controller)
  let content = ''
  let firstTokenAt: string | null = null
  let requestId: string | null = null
  let finishReason = 'stop'
  let usage = {
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    cacheReadTokens: null as number | null,
    reasoningTokens: null as number | null,
  }
  try {
    const changed = db
      .query("UPDATE generations SET status = 'streaming', started_at = ? WHERE id = ? AND status = 'accepted'")
      .run(nowIso(), prepared.id)
    if (changed.changes !== 1) throw new AppError(409, 'GENERATION_NOT_ACTIVE', '生成任务已经结束')
    await publishGenerationLifecycle({
      phase: 'started',
      generationId: prepared.id,
      conversationId: prepared.conversationId,
      playerMessageId: prepared.playerMessageId,
      kind: prepared.kind,
      occurredAt: nowIso(),
    })
    const generationConfig = db
      .query('SELECT provider_config_json, expected_checkpoint_id FROM generations WHERE id = ?')
      .get(prepared.id) as Row
    const provider = JSON.parse(String(generationConfig.provider_config_json)) as ModelProviderSnapshot
    let prompt = await buildModelMessages(
      prepared.conversationId,
      prepared.playerMessageId,
      String(generationConfig.expected_checkpoint_id),
    )
    db.query('UPDATE generations SET context_estimate_json = ? WHERE id = ?').run(
      JSON.stringify(prompt.contextEstimate),
      prepared.id,
    )
    const streamPrompt = async () => {
      for await (const chunk of modelRuntime.stream({
        system: prompt.system,
        messages: prompt.messages,
        signal: controller.signal,
        provider,
      })) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (chunk.type === 'metadata') requestId = chunk.requestId || null
        if (chunk.type === 'finish') finishReason = chunk.reason
        if (chunk.type === 'usage')
          usage = {
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
            cacheReadTokens: chunk.usage.cacheReadTokens ?? null,
            reasoningTokens: chunk.usage.reasoningTokens ?? null,
          }
        if ((chunk.type === 'text' || chunk.type === 'reasoning') && !firstTokenAt) firstTokenAt = nowIso()
        if (chunk.type === 'text') {
          content += chunk.text
          if (content.length > config.maxMessageChars)
            throw new AppError(422, 'MODEL_RESPONSE_TOO_LONG', '模型回复超过长度限制')
          emit({ event: 'delta', data: { generationId: prepared.id, text: chunk.text } })
        }
      }
    }
    try {
      await streamPrompt()
    } catch (error) {
      if (error instanceof ModelProviderError && error.code === 'MODEL_CONTEXT_LIMIT' && !firstTokenAt && !content) {
        const degradedPrompt = degradePromptForContextLimit(prompt)
        if (!degradedPrompt) throw error
        prompt = degradedPrompt
        db.query('UPDATE generations SET context_estimate_json = ? WHERE id = ?').run(
          JSON.stringify(prompt.contextEstimate),
          prepared.id,
        )
        await streamPrompt()
      } else {
        throw error
      }
    }
    content = content.trim()
    if (!content) throw new AppError(502, 'MODEL_EMPTY_RESPONSE', '模型没有返回故事正文')

    const completed = db.transaction(() => {
      const generation = db
        .query("SELECT * FROM generations WHERE id = ? AND status = 'streaming'")
        .get(prepared.id) as Row | null
      if (!generation) throw new AppError(409, 'GENERATION_NOT_ACTIVE', '生成任务已经结束')
      const conversation = requireConversation(prepared.conversationId)
      if (
        conversation.active_leaf_message_id !== generation.expected_leaf_id ||
        conversation.active_checkpoint_id !== generation.expected_checkpoint_id
      )
        throw new AppError(409, 'CONVERSATION_CHANGED', '生成期间剧情状态发生变化')
      const player = getMessageRow(prepared.playerMessageId)
      if (!player) throw new AppError(409, 'PLAYER_MESSAGE_NOT_FOUND', '玩家消息已经不存在')
      const baseline = db
        .query('SELECT * FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
        .get(String(player.runtime_checkpoint_id), prepared.conversationId) as Row | null
      if (!baseline) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法恢复本轮故事状态')
      const modBaseline = db
        .query('SELECT mod_snapshot_json FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
        .get(String(generation.expected_checkpoint_id), prepared.conversationId) as Row | null
      if (!modBaseline) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法恢复本轮 MOD 配置')
      const messageId = newId()
      const checkpointId = newId()
      const timestamp = nowIso()
      const contextEstimate = withActualInputTokens(prompt.contextEstimate, usage.inputTokens, timestamp)
      db.query(`
        INSERT INTO messages (
          id, conversation_id, chapter_id, parent_message_id, generation_id,
          sender, character_id, content, tree_depth, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        messageId,
        prepared.conversationId,
        String(player.chapter_id),
        prepared.playerMessageId,
        prepared.id,
        prompt.characterId ? 'character' : 'narrator',
        prompt.characterId,
        content,
        Number(player.tree_depth) + 1,
        timestamp,
      )
      db.query(`
        INSERT INTO runtime_checkpoints (
          id, conversation_id, parent_checkpoint_id, anchor_message_id,
          state_json, ability_snapshot_json, mod_snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        checkpointId,
        prepared.conversationId,
        String(baseline.id),
        messageId,
        String(baseline.state_json),
        String(baseline.ability_snapshot_json),
        String(modBaseline.mod_snapshot_json),
        timestamp,
      )
      db.query('UPDATE messages SET runtime_checkpoint_id = ? WHERE id = ?').run(checkpointId, messageId)
      const memoryState = applyLongTermMemoryForLeaf({
        conversationId: prepared.conversationId,
        leafMessageId: messageId,
        state: parseJson<Record<string, any>>(baseline.state_json, {}),
        timestamp,
      }).state
      const stateJson = JSON.stringify(memoryState)
      db.query('UPDATE runtime_checkpoints SET state_json = ? WHERE id = ?').run(stateJson, checkpointId)
      db.query(`
        UPDATE generations SET status = 'completed', finished_at = ?, finish_reason = ?,
          input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, reasoning_tokens = ?,
          first_token_at = ?, provider_request_id = ?, context_estimate_json = ?
        WHERE id = ?
      `).run(
        timestamp,
        finishReason,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadTokens,
        usage.reasoningTokens,
        firstTokenAt,
        requestId,
        JSON.stringify(contextEstimate),
        prepared.id,
      )
      db.query(`
        UPDATE conversations
        SET active_leaf_message_id = ?, active_checkpoint_id = ?, state_json = ?,
            ability_snapshot_json = ?, mod_snapshot_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        messageId,
        checkpointId,
        stateJson,
        String(baseline.ability_snapshot_json),
        String(modBaseline.mod_snapshot_json),
        timestamp,
        prepared.conversationId,
      )
      return { message: mapMessage(getMessageRow(messageId)!), checkpointId, timestamp }
    })()
    await publishGenerationLifecycle({
      phase: 'completed',
      generationId: prepared.id,
      conversationId: prepared.conversationId,
      playerMessageId: prepared.playerMessageId,
      kind: prepared.kind,
      occurredAt: nowIso(),
      messageId: String(completed.message.id),
      finishReason,
      usage,
    })
    emit({
      event: 'completed',
      data: {
        generationId: prepared.id,
        message: completed.message,
        activeLeafMessageId: String(completed.message.id),
        activeCheckpointId: completed.checkpointId,
        updatedAt: completed.timestamp,
      },
    })
  } catch (error) {
    const normalized =
      error instanceof AppError
        ? {
            code: error.code,
            message: error.message,
            retryable: error.status >= 500 || error.code === 'MODEL_RESPONSE_TOO_LONG',
          }
        : normalizeModelError(error)
    const status = normalized.code === 'GENERATION_CANCELLED' ? 'cancelled' : 'failed'
    db.query(`
      UPDATE generations SET status = ?, error_code = ?, finished_at = ?, finish_reason = ?,
        input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, reasoning_tokens = ?,
        first_token_at = ?, provider_request_id = ?, retry_after_ms = ?
      WHERE id = ? AND status IN ('accepted', 'streaming')
    `).run(
      status,
      normalized.code,
      nowIso(),
      finishReason,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.reasoningTokens,
      firstTokenAt,
      'requestId' in normalized ? normalized.requestId || requestId : requestId,
      'retryAfterMs' in normalized ? normalized.retryAfterMs || null : null,
      prepared.id,
    )
    await publishGenerationLifecycle({
      phase: 'failed',
      generationId: prepared.id,
      conversationId: prepared.conversationId,
      playerMessageId: prepared.playerMessageId,
      kind: prepared.kind,
      occurredAt: nowIso(),
      code: normalized.code,
      retryable: normalized.retryable,
    })
    emit({ event: 'error', data: { generationId: prepared.id, ...normalized } })
  } finally {
    abortControllers.delete(prepared.id)
  }
}
