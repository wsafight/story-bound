import { defaultCustomStateSchema } from '@storybound/shared/schemas'
import { parseJson } from '../../repositories/conversations'
import { storyCustomState } from '../dynamicStateSchema'
import { requireConversation } from './guards'

type JsonRecord = Record<string, any>

const appManagedCustomKeys = new Set([
  'pinnedMemories',
  'chapterSummaries',
  'abilityUses',
  'stateSuggestions',
  'nodeProgress',
])

function customRecord(state: JsonRecord) {
  return state.custom && typeof state.custom === 'object' && !Array.isArray(state.custom) ? state.custom : {}
}

function storySnapshot(conversation: JsonRecord) {
  const card = parseJson<JsonRecord>(conversation.card_snapshot_json, {})
  return {
    ...card,
    stateSchema: card.stateSchema || defaultCustomStateSchema,
    statePolicy: Array.isArray(card.statePolicy) ? card.statePolicy : [],
  }
}

function schemaProperties(schema: JsonRecord) {
  return schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? schema.properties
    : {}
}

function protectedReason(input: { playerEditable: boolean; storyEditable: boolean; appManaged: boolean }) {
  if (input.appManaged) return '应用管理字段'
  if (!input.playerEditable) return '玩家不可直接编辑'
  if (!input.storyEditable) return '故事运行时不可编辑'
  return null
}

export function listStateSuggestions(conversationId: string) {
  const conversation = requireConversation(conversationId)
  const state = parseJson<JsonRecord>(conversation.state_json, {})
  const suggestions = Array.isArray(customRecord(state).stateSuggestions) ? customRecord(state).stateSuggestions : []
  return [...suggestions].reverse().map((suggestion) => ({
    id: String(suggestion.id || ''),
    title: String(suggestion.title || '未命名建议'),
    summary: String(suggestion.summary || ''),
    patch: suggestion.patch && typeof suggestion.patch === 'object' ? suggestion.patch : {},
    diff: Array.isArray(suggestion.diff) ? suggestion.diff : [],
    source: ['model', 'user', 'system'].includes(String(suggestion.source)) ? suggestion.source : 'system',
    status: ['pending', 'accepted', 'rejected'].includes(String(suggestion.status)) ? suggestion.status : 'pending',
    createdAt: String(suggestion.createdAt || ''),
    resolvedAt: suggestion.resolvedAt ? String(suggestion.resolvedAt) : null,
  }))
}

export function getStateFieldHints(conversationId: string) {
  const conversation = requireConversation(conversationId)
  const story = storySnapshot(conversation)
  const state = parseJson<JsonRecord>(conversation.state_json, {})
  const custom = customRecord(state)
  const storyCustom = storyCustomState(custom)
  const properties = schemaProperties(story.stateSchema)
  const policy = Array.isArray(story.statePolicy) ? story.statePolicy : []
  const keys = Array.from(
    new Set([...Object.keys(properties), ...Object.keys(storyCustom), ...appManagedCustomKeys]),
  ).sort()
  return keys.map((key) => {
    const field = properties[key] && typeof properties[key] === 'object' ? properties[key] : {}
    const itemPolicy = policy.find((item: any) => item?.path === `/custom/${key}`) || {}
    const appManaged = Boolean(itemPolicy.appManaged || appManagedCustomKeys.has(key))
    const playerEditable = itemPolicy.playerEditable !== false && !appManaged
    const storyEditable = itemPolicy.storyEditable !== false && !appManaged
    return {
      path: `/custom/${key}`,
      key,
      label: String(itemPolicy.label || field.title || key),
      type: String(field.type || 'unknown'),
      description: typeof field.description === 'string' ? field.description : '',
      value: custom[key] ?? null,
      playerEditable,
      storyEditable,
      appManaged,
      protectedReason: protectedReason({ playerEditable, storyEditable, appManaged }),
    }
  })
}
