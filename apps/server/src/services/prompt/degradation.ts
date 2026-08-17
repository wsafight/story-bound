import type { PromptAssembly } from '../../runtime/storyboundRuntime'
import { estimateTokens } from './contextCache'

function messageTokens(message: { content: string }) {
  return estimateTokens(message.content) + 4
}

export function degradePromptForContextLimit(assembly: PromptAssembly): PromptAssembly | null {
  const history = assembly.messages.slice(0, -1)
  const current = assembly.messages.at(-1)
  if (!current || history.length === 0) return null
  const removedTokens = history.reduce((total, message) => total + messageTokens(message), 0)
  const historyMessageIds = assembly.contextEstimate.promptSnapshot?.historyMessageIds || []
  const removedHistoryMessageIds = historyMessageIds.slice(0, Math.max(0, historyMessageIds.length - 1))
  const estimatedTokensAfter = Math.max(0, assembly.contextEstimate.estimatedTokens - removedTokens)
  return {
    ...assembly,
    messages: [current],
    contextEstimate: {
      ...assembly.contextEstimate,
      estimatedTokens: estimatedTokensAfter,
      history: {
        includedMessages: 0,
        omittedMessages: assembly.contextEstimate.history.omittedMessages + history.length,
        estimatedTokens: 0,
      },
      contextLimitRetry: {
        reason: 'MODEL_CONTEXT_LIMIT',
        retryCount: 1,
        removedHistoryMessages: history.length,
        retainedHistoryMessages: 0,
        removedHistoryMessageIds,
        estimatedTokensBefore: assembly.contextEstimate.estimatedTokens,
        estimatedTokensAfter,
      },
    },
  }
}
