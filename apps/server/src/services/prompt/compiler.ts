import { createHash } from 'node:crypto'
import { estimateTokens } from './contextCache'
import { getPromptBlockDefinition, getPromptProfileSnapshot, promptScopeLabel, promptSourceLabel } from './registry'
import type { ContextEstimate, PromptBlock, PromptBlockSnapshot, PromptSnapshot } from './types'

export function promptHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function createPromptBlock(input: {
  id: string
  title: string
  source: PromptBlock['source']
  scope: PromptBlock['scope']
  priority: PromptBlock['priority']
  text: string
  tokenEstimate?: number
  dependencies?: string[]
  budget?: number
  included?: boolean
  reason?: PromptBlock['reason']
  includedItems?: number
  omittedItems?: number
}): PromptBlock {
  const text = input.text.trim()
  const included = input.included ?? Boolean(text)
  const reason = input.reason ?? (included ? undefined : 'empty')
  return {
    id: input.id,
    title: input.title,
    source: input.source,
    scope: input.scope,
    priority: input.priority,
    text,
    tokenEstimate: input.tokenEstimate ?? (text ? estimateTokens(text) : 0),
    hash: promptHash(text),
    dependencies: input.dependencies || [],
    budget: input.budget,
    included,
    reason,
    includedItems: input.includedItems,
    omittedItems: input.omittedItems,
  }
}

export function promptBlockToSegment(block: PromptBlock): ContextEstimate['segments'][number] {
  const definition = getPromptBlockDefinition(block.id)
  return {
    name: block.title,
    estimatedTokens: block.tokenEstimate,
    includedItems: block.includedItems,
    omittedItems: block.omittedItems,
    source: definition?.sourceLabel || promptSourceLabel(block.source),
    scope: definition?.scopeLabel || promptScopeLabel(block.scope),
    priority: block.priority,
    budget: block.budget,
    included: block.included,
    reason: block.reason,
  }
}

export function assembleSystemPrompt(blocks: PromptBlock[]) {
  return blocks
    .filter((block) => block.included && block.text)
    .map((block) => block.text)
    .join('\n\n')
}

function snapshotBlock(block: PromptBlock): PromptBlockSnapshot {
  return {
    id: block.id,
    title: block.title,
    source: block.source,
    scope: block.scope,
    priority: block.priority,
    tokenEstimate: block.tokenEstimate,
    hash: block.hash,
    dependencies: block.dependencies,
    budget: block.budget,
    included: block.included,
    reason: block.reason,
    includedItems: block.includedItems,
    omittedItems: block.omittedItems,
  }
}

export function createPromptSnapshot(input: {
  blocks: PromptBlock[]
  finalSystem: string
  historyMessageIds: string[]
  contextWindow: number
  outputReserved: number
  envelopeReserved: number
  requestBudget: number
}): PromptSnapshot {
  const includedBlockHashes = input.blocks
    .filter((block) => block.included)
    .map((block) => `${block.id}:${block.hash}`)
    .join('\n')
  const profile = getPromptProfileSnapshot()
  return {
    version: 1,
    compiler: 'storybound.prompt-blocks',
    promptHash: promptHash(`${includedBlockHashes}\n${input.historyMessageIds.join('\n')}`),
    finalSystemHash: promptHash(input.finalSystem),
    blocks: input.blocks.map(snapshotBlock),
    historyMessageIds: input.historyMessageIds,
    budget: {
      contextWindow: input.contextWindow,
      outputReserved: input.outputReserved,
      envelopeReserved: input.envelopeReserved,
      requestBudget: input.requestBudget,
    },
    profile: {
      id: profile.id,
      version: profile.version,
      hash: profile.hash,
    },
    createdAt: new Date().toISOString(),
  }
}
