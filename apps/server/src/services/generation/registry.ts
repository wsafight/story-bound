import { db, nowIso } from '../../db/connection'
import { AppError } from '../../shared/errors'
import { abortControllers } from './runtimeState'
import type { Row } from './types'

export function cancelGeneration(generationId: string) {
  const generation = db.query('SELECT status FROM generations WHERE id = ?').get(generationId) as Row | null
  if (!generation) throw new AppError(404, 'GENERATION_NOT_FOUND', '没有找到生成任务')
  if (!['accepted', 'streaming'].includes(String(generation.status)))
    return { cancelled: false, status: generation.status }
  abortControllers.get(generationId)?.abort()
  db.query(
    "UPDATE generations SET status = 'cancelled', error_code = 'GENERATION_CANCELLED', finished_at = ? WHERE id = ? AND status IN ('accepted', 'streaming')",
  ).run(nowIso(), generationId)
  return { cancelled: true, status: 'cancelled' }
}

export function cancelAllGenerations() {
  for (const controller of abortControllers.values()) controller.abort()
  abortControllers.clear()
  db.query(`
    UPDATE generations
    SET status = 'cancelled', error_code = 'SERVER_STOPPED', finished_at = ?
    WHERE status IN ('accepted', 'streaming')
  `).run(nowIso())
}

export function getGeneration(generationId: string) {
  const row = db
    .query(`
    SELECT id, conversation_id, player_message_id, status, error_code, model, finish_reason,
      input_tokens, output_tokens, cache_read_tokens, reasoning_tokens, first_token_at,
      provider_request_id, retry_after_ms, context_estimate_json, created_at, started_at, finished_at
    FROM generations WHERE id = ?
  `)
    .get(generationId) as Row | null
  if (!row) throw new AppError(404, 'GENERATION_NOT_FOUND', '没有找到生成任务')
  return {
    id: row.id,
    conversationId: row.conversation_id,
    playerMessageId: row.player_message_id,
    status: row.status,
    errorCode: row.error_code,
    model: row.model,
    finishReason: row.finish_reason,
    usage:
      row.input_tokens === null
        ? null
        : {
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            cacheReadTokens: row.cache_read_tokens,
            reasoningTokens: row.reasoning_tokens,
          },
    firstTokenAt: row.first_token_at,
    providerRequestId: row.provider_request_id,
    retryAfterMs: row.retry_after_ms,
    contextEstimate: JSON.parse(String(row.context_estimate_json || '{}')),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}
