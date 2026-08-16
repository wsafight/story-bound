export type Row = Record<string, unknown>
export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type PromptBlockSource =
  | 'core'
  | 'story'
  | 'state'
  | 'fact'
  | 'lorebook'
  | 'memory'
  | 'node'
  | 'ability'
  | 'director'
  | 'mod'
  | 'history'
  | 'input'
export type PromptBlockScope = 'app' | 'story' | 'conversation' | 'chapter' | 'scene' | 'turn'
export type PromptPriority = 'required' | 'high' | 'medium' | 'low'
export type PromptOmittedReason =
  | 'budget_exceeded'
  | 'condition_not_matched'
  | 'disabled'
  | 'empty'
  | 'conflict_with_core_rule'

export interface PromptBlock {
  id: string
  title: string
  source: PromptBlockSource
  scope: PromptBlockScope
  priority: PromptPriority
  text: string
  tokenEstimate: number
  hash: string
  dependencies: string[]
  budget?: number
  included: boolean
  reason?: PromptOmittedReason
  includedItems?: number
  omittedItems?: number
}

export interface PromptBlockSnapshot {
  id: string
  title: string
  source: PromptBlockSource
  scope: PromptBlockScope
  priority: PromptPriority
  tokenEstimate: number
  hash: string
  dependencies: string[]
  budget?: number
  included: boolean
  reason?: PromptOmittedReason
  includedItems?: number
  omittedItems?: number
}

export interface PromptSnapshot {
  version: 1
  compiler: 'storybound.prompt-blocks'
  promptHash: string
  finalSystemHash: string
  blocks: PromptBlockSnapshot[]
  historyMessageIds: string[]
  budget: {
    contextWindow: number
    outputReserved: number
    envelopeReserved: number
    requestBudget: number
  }
  profile: {
    id: string
    version: number
    hash: string
  }
  createdAt: string
}

export interface ContextEstimate {
  contextWindow: number
  outputReserved: number
  envelopeReserved: number
  requestBudget: number
  estimatedTokens: number
  segments: Array<{
    name: string
    estimatedTokens: number
    includedItems?: number
    omittedItems?: number
    source?: string
    scope?: string
    priority?: 'required' | 'high' | 'medium' | 'low' | number
    budget?: number
    included?: boolean
    reason?: PromptOmittedReason
  }>
  history: { includedMessages: number; omittedMessages: number; estimatedTokens: number }
  promptSnapshot?: PromptSnapshot
  calibration?: {
    actualInputTokens: number
    estimateErrorTokens: number
    estimateErrorRatio: number
    measuredAt: string
  }
}
