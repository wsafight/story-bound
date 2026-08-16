import { parseJson } from '../../repositories/conversations'
import type { ContextEstimate, Row } from './types'

const tokenEstimateCache = new Map<string, number>()
const staticContextCache = new Map<
  string,
  {
    fingerprint: string
    story: Record<string, any>
    player: Record<string, any>
    model: Record<string, any>
    application: string
    world: string
    playerText: string
  }
>()

function touchCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > maxEntries) cache.delete(cache.keys().next().value!)
}

export function estimateTokens(value: string) {
  const cached = tokenEstimateCache.get(value)
  if (cached !== undefined) {
    touchCacheEntry(tokenEstimateCache, value, cached, 2_048)
    return cached
  }
  let cjk = 0
  let other = 0
  for (const character of value) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) cjk += 1
    else other += 1
  }
  const result = Math.max(1, Math.ceil(cjk * 1.15 + other / 3))
  if (value.length <= 50_000) touchCacheEntry(tokenEstimateCache, value, result, 2_048)
  return result
}

export function withActualInputTokens(
  estimate: ContextEstimate,
  actualInputTokens: number | null,
  measuredAt: string,
): ContextEstimate {
  if (actualInputTokens === null) return estimate
  const estimateErrorTokens = actualInputTokens - estimate.estimatedTokens
  return {
    ...estimate,
    calibration: {
      actualInputTokens,
      estimateErrorTokens,
      estimateErrorRatio: estimate.estimatedTokens > 0 ? estimateErrorTokens / estimate.estimatedTokens : 0,
      measuredAt,
    },
  }
}

export function getStaticContext(conversationId: string, conversation: Row) {
  const cardRaw = String(conversation.card_snapshot_json || '{}')
  const playerRaw = String(conversation.player_snapshot_json || '{}')
  const modelRaw = String(conversation.model_config_json || '{}')
  const fingerprint = `${cardRaw}\n${playerRaw}\n${modelRaw}`
  const cached = staticContextCache.get(conversationId)
  if (cached?.fingerprint === fingerprint) {
    touchCacheEntry(staticContextCache, conversationId, cached, 200)
    return cached
  }

  const story = parseJson<Record<string, any>>(cardRaw, {})
  const player = parseJson<Record<string, any>>(playerRaw, {})
  const model = parseJson<Record<string, any>>(modelRaw, {})
  const application = [
    '你正在主持一个单人互动故事。始终使用简体中文。',
    '延续当前场景，尊重玩家已经做出的选择，不替玩家决定关键行动。',
    '回复应包含具体可感知的环境、人物反应和一个自然的继续空间。不要输出规则说明、JSON、选项菜单或元评论。',
  ].join('\n')
  const world = [
    `故事：${story.title || ''}`,
    `背景：${story.background || ''}`,
    `世界规则：${story.worldRules || ''}`,
    `内容边界：${Array.isArray(story.contentBoundaries) ? story.contentBoundaries.join('；') : ''}`,
  ].join('\n')
  const playerText = `玩家：${player.name || ''}，身份：${player.roleName || ''}，背景：${player.background || ''}，目标：${player.goals || ''}${player.note ? `，补充：${player.note}` : ''}`
  const result = { fingerprint, story, player, model, application, world, playerText }
  touchCacheEntry(staticContextCache, conversationId, result, 200)
  return result
}
