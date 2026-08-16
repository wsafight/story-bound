import { parseJson } from '../../repositories/conversations'
import { requireConversation } from './guards'
import { collectRecallSourceDiagnostics, recallSearchTerms, recallSourceCapabilities } from './recallSources'

type JsonRecord = Record<string, any>

export function getRecallDiagnostics(conversationId: string, currentInput = '') {
  const conversation = requireConversation(conversationId)
  const state = parseJson<JsonRecord>(conversation.state_json, {})
  const query = currentInput.trim()
  const terms = recallSearchTerms(query)
  const diagnostics = collectRecallSourceDiagnostics({ conversationId, state, query, terms }).sort(
    (left, right) => Number(right.matched) - Number(left.matched) || right.relevanceScore - left.relevanceScore,
  )

  const matchedItems = diagnostics.filter((item) => item.matched).length
  return {
    query,
    engine: {
      active: 'lexical' as const,
      fts5Ready: recallSourceCapabilities().every((source) => source.fts5Ready),
      sources: recallSourceCapabilities(),
    },
    totalItems: diagnostics.length,
    matchedItems,
    diagnostics,
    warnings: [
      ...(terms.length === 0 ? ['没有输入检索词，只能展示候选资料边界。'] : []),
      ...(diagnostics.some((item) => item.source === 'lorebook') &&
      !diagnostics.some((item) => item.source === 'lorebook' && item.matched)
        ? ['当前输入没有命中 Storybound Lorebook。']
        : []),
    ],
  }
}
