import { db, newId } from '../../db/connection'

type Row = Record<string, unknown>

export const shortTermMemoryRounds = 6
export const recentRawRounds = 2
export const shortTermHistoryMessageLimit = shortTermMemoryRounds * 2
export const recentRawHistoryMessageLimit = recentRawRounds * 2
export const clippedHistoryCharLimit = 72
const maxLongTermMemories = 8
const maxFactsPerMemory = 4
const factLimit = 72
const summaryLimit = 240
const foldBatchSize = 3

export type LongTermMemory = {
  id: string
  fromMessageId: string
  toMessageId: string
  fromDepth: number
  toDepth: number
  messageCount: number
  summary: string
  facts: string[]
  createdAt: string
}

function compactText(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function clipText(value: unknown, limit = factLimit) {
  const text = compactText(value)
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function messageDepth(row: Row) {
  return Math.max(0, Number(row.tree_depth) || 0)
}

function roundNumber(depth: number) {
  return Math.max(1, Math.ceil(depth / 2))
}

function messageLabel(row: Row) {
  if (row.sender === 'player') {
    const labels = { dialogue: '玩家对话', action: '玩家行动', narration: '玩家旁白' } as const
    return labels[String(row.input_mode) as keyof typeof labels] || '玩家输入'
  }
  if (row.sender === 'character') return '角色回复'
  return '叙事回复'
}

function activePath(conversationId: string, leafMessageId: string) {
  return db
    .query(`
      WITH RECURSIVE active_path AS (
        SELECT id, parent_message_id, sender, input_mode, content, tree_depth
        FROM messages WHERE id = ? AND conversation_id = ?
        UNION ALL
        SELECT parent.id, parent.parent_message_id, parent.sender, parent.input_mode, parent.content, parent.tree_depth
        FROM messages parent
        JOIN active_path ON parent.id = active_path.parent_message_id
        WHERE parent.conversation_id = ?
      )
      SELECT * FROM active_path ORDER BY tree_depth ASC
    `)
    .all(leafMessageId, conversationId, conversationId) as Row[]
}

function normalizeFacts(value: unknown) {
  if (!Array.isArray(value)) return []
  const facts: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const fact = clipText(item, factLimit)
    const key = fact.replace(/[。．.]+$/, '')
    if (!fact || seen.has(key)) continue
    seen.add(key)
    facts.push(fact)
    if (facts.length >= maxFactsPerMemory) break
  }
  return facts
}

function normalizeLongTermMemories(value: unknown): LongTermMemory[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const summary = compactText(raw.summary)
      const id = compactText(raw.id)
      const fromMessageId = compactText(raw.fromMessageId)
      const toMessageId = compactText(raw.toMessageId)
      if (!id || !fromMessageId || !toMessageId || !summary) return null
      return {
        id,
        fromMessageId,
        toMessageId,
        fromDepth: messageDepth({ tree_depth: raw.fromDepth }),
        toDepth: messageDepth({ tree_depth: raw.toDepth }),
        messageCount: Math.max(1, Number(raw.messageCount) || 1),
        summary: summary.slice(0, summaryLimit),
        facts: normalizeFacts(raw.facts),
        createdAt: compactText(raw.createdAt),
      }
    })
    .filter((item): item is LongTermMemory => Boolean(item))
}

function extractSentences(value: unknown) {
  return compactText(value)
    .split(/(?<=[。！？!?])\s+|\n+/)
    .map((line) => compactText(line).replace(/[。．.]+$/, ''))
    .filter((line) => line.length >= 4)
}

function extractFacts(segment: Row[]) {
  const facts: string[] = []
  const seen = new Set<string>()
  for (const row of segment) {
    const sentence = extractSentences(row.content)[0]
    if (!sentence) continue
    const fact = clipText(`${messageLabel(row)}：${sentence}`, factLimit)
    const key = fact.replace(/[。．.]+$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    facts.push(fact)
    if (facts.length >= maxFactsPerMemory) break
  }
  return facts
}

function summarizeSegment(segment: Row[], timestamp: string): LongTermMemory {
  const from = segment[0]!
  const to = segment.at(-1)!
  const facts = extractFacts(segment)
  const fromRound = roundNumber(messageDepth(from))
  const toRound = Math.max(fromRound, roundNumber(messageDepth(to)))
  const rangeLabel = fromRound === toRound ? `第${fromRound}轮` : `第${fromRound}-${toRound}轮`
  const summary = facts.length
    ? `${rangeLabel}要点：${facts.map((fact) => fact.replace(/^[^：]{1,8}：/, '')).join('；')}`
    : `${rangeLabel}已归档，暂无新的稳定线索。`

  return {
    id: newId(),
    fromMessageId: String(from.id),
    toMessageId: String(to.id),
    fromDepth: messageDepth(from),
    toDepth: messageDepth(to),
    messageCount: segment.length,
    summary: summary.slice(0, summaryLimit),
    facts,
    createdAt: timestamp,
  }
}

function mergeMemories(items: LongTermMemory[], timestamp: string): LongTermMemory {
  const from = items[0]!
  const to = items.at(-1)!
  const facts = normalizeFacts(items.flatMap((item) => item.facts))
  const fromRound = roundNumber(from.fromDepth)
  const toRound = Math.max(fromRound, roundNumber(to.toDepth))
  const summary = facts.length
    ? `更早剧情（第${fromRound}-${toRound}轮）已合并：${facts.join('；')}`
    : items.map((item) => item.summary).join(' ')

  return {
    id: newId(),
    fromMessageId: from.fromMessageId,
    toMessageId: to.toMessageId,
    fromDepth: from.fromDepth,
    toDepth: to.toDepth,
    messageCount: items.reduce((total, item) => total + item.messageCount, 0),
    summary: summary.slice(0, summaryLimit),
    facts,
    createdAt: timestamp,
  }
}

function capMemories(memories: LongTermMemory[], timestamp: string) {
  if (memories.length <= maxLongTermMemories) return memories
  const foldCount = Math.min(foldBatchSize, memories.length - maxLongTermMemories + 1)
  return [mergeMemories(memories.slice(0, foldCount), timestamp), ...memories.slice(foldCount)].slice(
    -maxLongTermMemories,
  )
}

export function ensureMemoryCustom(custom: Record<string, any> = {}) {
  return {
    ...custom,
    pinnedMemories: Array.isArray(custom.pinnedMemories) ? custom.pinnedMemories : [],
    longTermMemories: normalizeLongTermMemories(custom.longTermMemories),
  }
}

export function applyLongTermMemoryForLeaf(input: {
  conversationId: string
  leafMessageId: string
  state: Record<string, any>
  timestamp: string
}) {
  const path = activePath(input.conversationId, input.leafMessageId)
  const pathIds = new Set(path.map((row) => String(row.id)))
  const custom = input.state.custom && typeof input.state.custom === 'object' ? input.state.custom : {}
  const existing = normalizeLongTermMemories(custom.longTermMemories)
  const memoriesOnPath = existing.filter((item) => pathIds.has(item.fromMessageId) && pathIds.has(item.toMessageId))
  const cutoffIndex = path.length - shortTermHistoryMessageLimit

  let lastSummarizedIndex = -1
  for (const memory of memoriesOnPath) {
    const index = path.findIndex((row) => String(row.id) === memory.toMessageId)
    if (index > lastSummarizedIndex) lastSummarizedIndex = index
  }

  const shouldPrune = memoriesOnPath.length !== existing.length
  if (cutoffIndex <= 1) {
    if (!shouldPrune) {
      if (Array.isArray(custom.pinnedMemories) && Array.isArray(custom.longTermMemories)) {
        return { state: input.state, changed: false }
      }
      return {
        state: { ...input.state, custom: ensureMemoryCustom(custom) },
        changed: true,
      }
    }
    return {
      state: { ...input.state, custom: { ...ensureMemoryCustom(custom), longTermMemories: memoriesOnPath } },
      changed: true,
    }
  }

  const segment = path.slice(lastSummarizedIndex + 1, cutoffIndex)
  if (segment.length === 0) {
    if (!shouldPrune) return { state: input.state, changed: false }
    return {
      state: { ...input.state, custom: { ...ensureMemoryCustom(custom), longTermMemories: memoriesOnPath } },
      changed: true,
    }
  }

  const nextMemories = capMemories([...memoriesOnPath, summarizeSegment(segment, input.timestamp)], input.timestamp)
  return {
    state: { ...input.state, custom: { ...ensureMemoryCustom(custom), longTermMemories: nextMemories } },
    changed: true,
  }
}

export function longTermMemoriesForPrompt(state: Record<string, any>) {
  return ensureMemoryCustom(state.custom).longTermMemories
}

export function formatLongTermMemoryForPrompt(item: LongTermMemory) {
  if (item.facts.length > 0) return item.facts.map((fact) => `- ${fact}`).join('\n')
  return `- ${item.summary}`
}

export function clipHistoryContent(content: string, newerMessageCount: number) {
  if (newerMessageCount < recentRawHistoryMessageLimit) return content
  return clipText(content, clippedHistoryCharLimit)
}
