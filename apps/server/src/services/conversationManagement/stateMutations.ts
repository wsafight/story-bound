import { defaultCustomStateSchema } from '@storybound/shared/schemas'
import { db, nowIso } from '../../db/connection'
import { parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { assertCustomStateMatchesSchema, storyCustomState } from '../dynamicStateSchema'
import { type ConversationRow, insertConversationEvent, requireCheckpoint, writeStateCheckpoint } from './guards'

export const appManagedCustomKeys = new Set([
  'pinnedMemories',
  'chapterSummaries',
  'longTermMemories',
  'abilityUses',
  'stateSuggestions',
  'nodeProgress',
])

export type StateMutationContext = {
  conversationId: string
  expectedLeafMessageId: string
  expectedCheckpointId: string
  conversation: ConversationRow
  checkpoint: ConversationRow
  state: Record<string, any>
  timestamp: string
}

export type StateMutationCommit = {
  kind: string
  payload: Record<string, unknown>
}

export function storySnapshot(conversation: ConversationRow) {
  const card = parseJson<Record<string, any>>(conversation.card_snapshot_json, {})
  return {
    ...card,
    stateSchema: card.stateSchema || defaultCustomStateSchema,
    defaultState: card.defaultState && typeof card.defaultState === 'object' ? card.defaultState : {},
    statePolicy: Array.isArray(card.statePolicy) ? card.statePolicy : [],
  }
}

export function customRecord(state: Record<string, any>) {
  return state.custom && typeof state.custom === 'object' && !Array.isArray(state.custom) ? { ...state.custom } : {}
}

function pointerKey(key: string) {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

function jsonValue(value: unknown) {
  return value === undefined ? null : value
}

export function customPatchDiff(
  before: Record<string, any>,
  after: Record<string, any>,
  patch: Record<string, unknown>,
) {
  return Object.keys(patch)
    .sort()
    .map((key) => {
      const beforeMissing = !Object.hasOwn(before, key)
      const afterMissing = !Object.hasOwn(after, key)
      return {
        path: `/custom/${pointerKey(key)}`,
        before: jsonValue(before[key]),
        after: jsonValue(after[key]),
        beforeMissing: beforeMissing || undefined,
        afterMissing: afterMissing || undefined,
      }
    })
}

function assertNoAppManagedPatch(patch: Record<string, unknown>) {
  const blocked = Object.keys(patch).filter((key) => appManagedCustomKeys.has(key))
  if (blocked.length > 0) {
    throw new AppError(422, 'STATE_FIELD_APP_MANAGED', `这些状态字段由应用管理：${blocked.join('、')}`)
  }
}

function assertStatePolicyAllows(card: ReturnType<typeof storySnapshot>, patch: Record<string, unknown>) {
  for (const key of Object.keys(patch)) {
    const policy = card.statePolicy.find((item: any) => item?.path === `/custom/${key}`)
    if (policy?.appManaged || policy?.playerEditable === false) {
      throw new AppError(422, 'STATE_FIELD_PROTECTED', `状态字段 ${key} 当前不允许直接修改`)
    }
  }
}

export function mergeStoryCustom(input: {
  conversation: ConversationRow
  state: Record<string, any>
  patch: Record<string, unknown>
  label: string
  enforcePolicy?: boolean
}) {
  assertNoAppManagedPatch(input.patch)
  const card = storySnapshot(input.conversation)
  if (input.enforcePolicy) assertStatePolicyAllows(card, input.patch)
  const currentCustom = customRecord(input.state)
  const mergedCustom = { ...currentCustom, ...input.patch }
  const managedEntries = Object.fromEntries(
    Object.entries(currentCustom).filter(([key]) => appManagedCustomKeys.has(key)),
  )
  const storyEntries = { ...storyCustomState(mergedCustom) }
  assertCustomStateMatchesSchema(card.stateSchema, { ...storyEntries, ...managedEntries }, input.label)
  input.state.custom = { ...storyEntries, ...managedEntries }
  return input.state
}

export function previewStoryCustomPatch(input: {
  conversation: ConversationRow
  state: Record<string, any>
  patch: Record<string, unknown>
  label: string
}) {
  const previewState = parseJson<Record<string, any>>(JSON.stringify(input.state), {})
  mergeStoryCustom({
    conversation: input.conversation,
    state: previewState,
    patch: input.patch,
    label: input.label,
  })
  return previewState
}

function writeMutationEvent(input: { context: StateMutationContext; kind: string; payload: Record<string, unknown> }) {
  const checkpointId = writeStateCheckpoint({
    conversationId: input.context.conversationId,
    parentCheckpointId: input.context.expectedCheckpointId,
    anchorMessageId: input.context.expectedLeafMessageId,
    checkpoint: input.context.checkpoint,
    state: input.context.state,
    timestamp: input.context.timestamp,
  })
  const event = insertConversationEvent({
    conversationId: input.context.conversationId,
    anchorMessageId: input.context.expectedLeafMessageId,
    checkpointId,
    kind: input.kind,
    payload: input.payload,
    timestamp: input.context.timestamp,
  })
  return {
    activeCheckpointId: checkpointId,
    state: input.context.state,
    event,
    updatedAt: input.context.timestamp,
  }
}

export function commitStateMutation(
  conversationId: string,
  input: {
    expectedLeafMessageId: string
    expectedCheckpointId: string
  },
  mutate: (context: StateMutationContext) => StateMutationCommit,
) {
  return db.transaction(() => {
    const { conversation, checkpoint } = requireCheckpoint(
      conversationId,
      input.expectedLeafMessageId,
      input.expectedCheckpointId,
    )
    const context: StateMutationContext = {
      conversationId,
      expectedLeafMessageId: input.expectedLeafMessageId,
      expectedCheckpointId: input.expectedCheckpointId,
      conversation,
      checkpoint,
      state: parseJson<Record<string, any>>(conversation.state_json, {}),
      timestamp: nowIso(),
    }
    const committed = mutate(context)
    return writeMutationEvent({
      context,
      kind: committed.kind,
      payload: committed.payload,
    })
  })()
}
