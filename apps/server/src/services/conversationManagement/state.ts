import { defaultCustomStateSchema } from '@storybound/shared/schemas'
import { db } from '../../db/connection'
import type {
  CreateStateSuggestionInput,
  ResolveStateSuggestionInput,
  UpdateConversationStateInput,
  UseAbilityInput,
} from '../../domain/schemas'
import { parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { assertValueMatchesSchema } from '../dynamicStateSchema'
import {
  commitStateMutation,
  customPatchDiff,
  customRecord,
  mergeStoryCustom,
  previewStoryCustomPatch,
} from './stateMutations'

export function updateConversationState(conversationId: string, input: UpdateConversationStateInput) {
  return commitStateMutation(conversationId, input, ({ conversation, state }) => {
    const beforeCustom = customRecord(state)
    mergeStoryCustom({
      conversation,
      state,
      patch: input.custom,
      label: '自定义状态',
      enforcePolicy: true,
    })
    const diff = customPatchDiff(beforeCustom, customRecord(state), input.custom)
    return {
      kind: 'state_updated',
      payload: { patch: input.custom, diff },
    }
  })
}

export function useConversationAbility(conversationId: string, input: UseAbilityInput) {
  return commitStateMutation(conversationId, input, ({ conversation, state, timestamp }) => {
    const abilities = parseJson<Array<Record<string, any>>>(conversation.ability_snapshot_json, [])
    const ability = abilities.find((item) => String(item.id) === input.abilityId)
    if (!ability) throw new AppError(404, 'ABILITY_NOT_FOUND', '这个存档没有启用该能力')
    assertValueMatchesSchema(ability.inputSchema || defaultCustomStateSchema, input.input, `能力“${ability.name}”输入`)

    const activeMessage = db
      .query('SELECT tree_depth FROM messages WHERE id = ? AND conversation_id = ?')
      .get(input.expectedLeafMessageId, conversationId) as Record<string, unknown> | null
    if (!activeMessage) throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法读取当前故事位置')
    const depth = Number(activeMessage.tree_depth) || 0
    const currentCustom = customRecord(state)
    const abilityUses = {
      ...(currentCustom.abilityUses && typeof currentCustom.abilityUses === 'object' ? currentCustom.abilityUses : {}),
    } as Record<string, any>
    const currentUse = abilityUses[input.abilityId] || { count: 0 }
    const runtime = ability.runtime || {}
    const usesPerConversation = runtime.usesPerConversation ?? null
    if (usesPerConversation !== null && Number(currentUse.count || 0) >= Number(usesPerConversation)) {
      throw new AppError(409, 'ABILITY_USES_EXHAUSTED', '这个能力在当前存档中的使用次数已经耗尽')
    }
    const cooldownTurns = Number(runtime.cooldownTurns || 0)
    if (
      cooldownTurns > 0 &&
      currentUse.lastUsedAtDepth !== undefined &&
      depth - Number(currentUse.lastUsedAtDepth) <= cooldownTurns
    ) {
      throw new AppError(409, 'ABILITY_COOLDOWN_ACTIVE', '这个能力仍在冷却中')
    }

    const runtimePatch =
      runtime.statePatch && typeof runtime.statePatch === 'object' && !Array.isArray(runtime.statePatch)
        ? runtime.statePatch
        : {}
    const patch = { ...runtimePatch, ...input.statePatch }
    const beforePatchCustom = customRecord(state)
    mergeStoryCustom({ conversation, state, patch, label: `能力“${ability.name}”状态提交` })
    const diff = customPatchDiff(beforePatchCustom, customRecord(state), patch)
    state.custom = customRecord(state)
    state.custom.abilityUses = {
      ...abilityUses,
      [input.abilityId]: {
        count: Number(currentUse.count || 0) + 1,
        lastUsedAtMessageId: input.expectedLeafMessageId,
        lastUsedAtDepth: depth,
        updatedAt: timestamp,
      },
    }

    return {
      kind: 'ability_used',
      payload: { abilityId: input.abilityId, abilityName: String(ability.name || ''), patch, diff, input: input.input },
    }
  })
}

export function createStateSuggestion(conversationId: string, input: CreateStateSuggestionInput) {
  return commitStateMutation(conversationId, input, ({ conversation, state, timestamp }) => {
    const beforeCustom = customRecord(state)
    const previewState = previewStoryCustomPatch({
      conversation,
      state,
      patch: input.patch,
      label: '状态变化建议',
    })
    const diff = customPatchDiff(beforeCustom, customRecord(previewState), input.patch)

    const custom = customRecord(state)
    const suggestion = {
      id: crypto.randomUUID(),
      title: input.title,
      summary: input.summary,
      patch: input.patch,
      diff,
      source: input.source,
      status: 'pending',
      createdAt: timestamp,
    }
    const suggestions = Array.isArray(custom.stateSuggestions) ? [...custom.stateSuggestions] : []
    custom.stateSuggestions = [...suggestions, suggestion].slice(-50)
    state.custom = custom

    return {
      kind: 'state_suggestion_created',
      payload: {
        suggestionId: suggestion.id,
        title: suggestion.title,
        summary: suggestion.summary,
        patch: suggestion.patch,
        diff,
      },
    }
  })
}

export function resolveStateSuggestion(conversationId: string, input: ResolveStateSuggestionInput) {
  return commitStateMutation(conversationId, input, ({ conversation, state, timestamp }) => {
    const custom = customRecord(state)
    const suggestions = Array.isArray(custom.stateSuggestions) ? [...custom.stateSuggestions] : []
    const index = suggestions.findIndex((item: any) => item?.id === input.suggestionId)
    if (index < 0) throw new AppError(404, 'STATE_SUGGESTION_NOT_FOUND', '没有找到这条状态变化建议')
    const suggestion = suggestions[index] as Record<string, any>
    if (suggestion.status !== 'pending') {
      throw new AppError(409, 'STATE_SUGGESTION_RESOLVED', '这条状态变化建议已经处理过')
    }
    const patch = input.accept ? input.patch || suggestion.patch || {} : {}
    const beforeCustom = customRecord(state)
    if (input.accept) mergeStoryCustom({ conversation, state, patch, label: '接受状态变化建议' })
    const diff = input.accept ? customPatchDiff(beforeCustom, customRecord(state), patch) : []
    const nextCustom = customRecord(state)
    const nextSuggestions = Array.isArray(nextCustom.stateSuggestions) ? [...nextCustom.stateSuggestions] : suggestions
    nextSuggestions[index] = {
      ...suggestion,
      patch: input.accept ? patch : suggestion.patch,
      diff: input.accept ? diff : suggestion.diff,
      status: input.accept ? 'accepted' : 'rejected',
      resolvedAt: timestamp,
    }
    nextCustom.stateSuggestions = nextSuggestions
    state.custom = nextCustom

    return {
      kind: input.accept ? 'state_suggestion_accepted' : 'state_suggestion_rejected',
      payload: {
        suggestionId: input.suggestionId,
        title: String(suggestion.title || ''),
        summary: String(suggestion.summary || ''),
        patch,
        diff,
      },
    }
  })
}
