import { getLorebookDiagnostics } from './lorebookDiagnostics'

type JsonRecord = Record<string, any>

export type RecallSourceId = 'lorebook' | 'pinned_memory' | 'chapter_summary' | 'long_term_memory'
export type RecallBoundary = 'background_lore' | 'confirmed_memory' | 'chapter_summary' | 'long_term_memory'
export type RecallReason =
  | 'matched'
  | 'query_empty'
  | 'disabled'
  | 'scope_not_matched'
  | 'condition_not_matched'
  | 'keyword_not_matched'
  | 'low_relevance'

export type RecallDiagnosticItem = {
  id: string
  title: string
  source: RecallSourceId
  boundary: RecallBoundary
  matched: boolean
  relevanceScore: number
  matchedTerms: string[]
  contentPreview: string
  reasons: RecallReason[]
}

export type RecallSourceContext = {
  conversationId: string
  state: JsonRecord
  query: string
  terms: string[]
}

export type RecallSource = {
  id: RecallSourceId
  label: string
  boundary: RecallBoundary
  engine: 'lexical'
  fts5Ready: boolean
  collect: (context: RecallSourceContext) => RecallDiagnosticItem[]
}

function normalized(value: unknown) {
  return String(value || '').toLowerCase()
}

export function previewRecallContent(value: unknown, limit = 180) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

export function recallSearchTerms(input: string) {
  const text = normalized(input)
  const terms: string[] = []
  const matches = text.match(/[a-z0-9_'-]+|[\u4e00-\u9fff]{2,}/gi) || []
  for (const match of matches) {
    terms.push(match)
    if (/^[\u4e00-\u9fff]+$/.test(match) && match.length > 3) {
      for (let index = 0; index <= match.length - 2; index += 1) {
        terms.push(match.slice(index, index + 2))
      }
      for (let index = 0; index <= match.length - 3; index += 1) {
        terms.push(match.slice(index, index + 3))
      }
    }
  }
  return unique(terms.filter((term) => term.length > 1)).slice(0, 32)
}

export function scoreRecallText(input: { queryTerms: string[]; text: string; boostedTerms?: string[] }) {
  const haystack = normalized(input.text)
  const boosted = new Set((input.boostedTerms || []).map(normalized).filter(Boolean))
  const matchedTerms = input.queryTerms.filter((term) => haystack.includes(term) || boosted.has(term))
  if (input.queryTerms.length === 0) {
    return { matchedTerms: [] as string[], relevanceScore: 0 }
  }
  const boost = matchedTerms.filter((term) => boosted.has(term)).length * 0.15
  return {
    matchedTerms,
    relevanceScore: Math.min(1, matchedTerms.length / input.queryTerms.length + boost),
  }
}

function memoryItems(state: JsonRecord) {
  const custom = state.custom && typeof state.custom === 'object' && !Array.isArray(state.custom) ? state.custom : {}
  const pinnedMemories = Array.isArray(custom.pinnedMemories) ? custom.pinnedMemories : []
  const chapterSummaries = Array.isArray(custom.chapterSummaries) ? custom.chapterSummaries : []
  const longTermMemories = Array.isArray(custom.longTermMemories) ? custom.longTermMemories : []
  return {
    pinnedMemories,
    chapterSummaries,
    longTermMemories,
  }
}

export const recallSources: RecallSource[] = [
  {
    id: 'lorebook',
    label: 'Storybound Lorebook',
    boundary: 'background_lore',
    engine: 'lexical',
    fts5Ready: true,
    collect(context) {
      return getLorebookDiagnostics(context.conversationId, context.query).map((item) => {
        const score = scoreRecallText({
          queryTerms: context.terms,
          text: `${item.title}\n${item.matchedKeywords.join('\n')}`,
          boostedTerms: item.matchedKeywords,
        })
        const matched = item.matched || score.relevanceScore >= 0.2
        return {
          id: item.entryId,
          title: item.title,
          source: 'lorebook',
          boundary: 'background_lore',
          matched,
          relevanceScore: matched ? Math.max(score.relevanceScore, item.matched ? 1 : 0.2) : score.relevanceScore,
          matchedTerms: unique([...item.matchedKeywords, ...score.matchedTerms]),
          contentPreview: '',
          reasons: matched ? (['matched'] as RecallReason[]) : item.reasons.filter((reason) => reason !== 'matched'),
        }
      })
    },
  },
  {
    id: 'pinned_memory',
    label: '固定记忆',
    boundary: 'confirmed_memory',
    engine: 'lexical',
    fts5Ready: true,
    collect(context) {
      return memoryItems(context.state).pinnedMemories.map((item: JsonRecord, index: number) => {
        const content = String(item.content || '')
        const score = scoreRecallText({ queryTerms: context.terms, text: content })
        const matched = context.terms.length === 0 ? false : score.relevanceScore >= 0.15
        return {
          id: String(item.messageId || `pinned-memory-${index + 1}`),
          title: `固定记忆 ${index + 1}`,
          source: 'pinned_memory',
          boundary: 'confirmed_memory',
          matched,
          relevanceScore: score.relevanceScore,
          matchedTerms: score.matchedTerms,
          contentPreview: previewRecallContent(content),
          reasons: matched
            ? (['matched'] as RecallReason[])
            : [context.terms.length === 0 ? 'query_empty' : 'low_relevance'],
        }
      })
    },
  },
  {
    id: 'long_term_memory',
    label: '长期记忆',
    boundary: 'long_term_memory',
    engine: 'lexical',
    fts5Ready: true,
    collect(context) {
      return memoryItems(context.state).longTermMemories.map((item: JsonRecord, index: number) => {
        const facts = Array.isArray(item.facts) ? item.facts : []
        const content = [item.summary, ...facts].filter(Boolean).join('\n')
        const score = scoreRecallText({ queryTerms: context.terms, text: content })
        const matched = context.terms.length === 0 ? false : score.relevanceScore >= 0.15
        return {
          id: String(item.id || `long-term-memory-${index + 1}`),
          title: `长期记忆 ${index + 1}`,
          source: 'long_term_memory',
          boundary: 'long_term_memory',
          matched,
          relevanceScore: score.relevanceScore,
          matchedTerms: score.matchedTerms,
          contentPreview: previewRecallContent(content),
          reasons: matched
            ? (['matched'] as RecallReason[])
            : [context.terms.length === 0 ? 'query_empty' : 'low_relevance'],
        }
      })
    },
  },
  {
    id: 'chapter_summary',
    label: '章节回顾',
    boundary: 'chapter_summary',
    engine: 'lexical',
    fts5Ready: true,
    collect(context) {
      return memoryItems(context.state).chapterSummaries.map((item: JsonRecord, index: number) => {
        const title = String(item.title || `第 ${item.number || index + 1} 章`)
        const content = `${title}\n${item.summary || ''}`
        const score = scoreRecallText({ queryTerms: context.terms, text: content })
        const matched = context.terms.length === 0 ? false : score.relevanceScore >= 0.15
        return {
          id: String(item.chapterId || `chapter-summary-${index + 1}`),
          title,
          source: 'chapter_summary',
          boundary: 'chapter_summary',
          matched,
          relevanceScore: score.relevanceScore,
          matchedTerms: score.matchedTerms,
          contentPreview: previewRecallContent(item.summary),
          reasons: matched
            ? (['matched'] as RecallReason[])
            : [context.terms.length === 0 ? 'query_empty' : 'low_relevance'],
        }
      })
    },
  },
]

export function recallSourceCapabilities() {
  return recallSources.map((source) => ({
    id: source.id,
    label: source.label,
    boundary: source.boundary,
    engine: source.engine,
    fts5Ready: source.fts5Ready,
  }))
}

export function collectRecallSourceDiagnostics(context: RecallSourceContext) {
  return recallSources.flatMap((source) => source.collect(context))
}
