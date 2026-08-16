import type { PromptContribution, PromptContributionResult } from '../../runtime/storyboundRuntime'
import { AppError } from '../../shared/errors'
import { estimateTokens } from './contextCache'

export function quota(total: number, ratio: number) {
  return Math.max(32, Math.floor(total * ratio))
}

export function assertSegmentBudget(name: string, content: string, budget: number) {
  const tokens = estimateTokens(content)
  if (tokens > budget) {
    throw new AppError(422, 'CONTEXT_BUDGET_EXCEEDED', `${name}超过当前模型的上下文配额`, {
      segment: name,
      estimatedTokens: tokens,
      budget,
    })
  }
  return tokens
}

export function includeRecords<T>(records: T[], render: (record: T) => string, budget: number, keepFirst = false) {
  const included: string[] = []
  let used = 0
  for (const [index, record] of records.entries()) {
    const text = render(record)
    const tokens = estimateTokens(text)
    if (used + tokens <= budget || (keepFirst && index === 0)) {
      included.push(text)
      used += tokens
    }
  }
  return {
    text: included.join('\n'),
    tokens: used,
    included: included.length,
    omitted: records.length - included.length,
  }
}

export function applyPromptContributions(contributions: PromptContribution[], budget: number) {
  let used = 0
  const results: PromptContributionResult[] = []
  const includedText: string[] = []
  for (const contribution of contributions) {
    const rendered = `[MOD · ${contribution.label}]\n${contribution.content}`
    const estimatedTokens = estimateTokens(rendered)
    if (used + estimatedTokens > budget) {
      if (contribution.required) {
        throw new AppError(422, 'MOD_CONTEXT_BUDGET_EXCEEDED', `${contribution.label}没有足够的提示词预算`, {
          modId: contribution.modId,
          estimatedTokens,
          remainingBudget: Math.max(0, budget - used),
        })
      }
      results.push({ ...contribution, estimatedTokens, included: false, reason: 'budget_exceeded' })
      continue
    }
    used += estimatedTokens
    includedText.push(rendered)
    results.push({ ...contribution, estimatedTokens, included: true })
  }
  return { text: includedText.join('\n\n'), used, results }
}
