import { storyCustomState } from '../dynamicStateSchema'

type JsonRecord = Record<string, any>

const statusLabels: Record<string, string> = {
  inactive: '未激活',
  available: '可触发',
  active: '进行中',
  completed: '已完成',
  skipped: '已跳过',
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function compactJson(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return JSON.stringify(value)
}

function customSchemaProperties(story: JsonRecord) {
  return isRecord(story.stateSchema?.properties) ? story.stateSchema.properties : {}
}

function statePolicyFor(story: JsonRecord, key: string) {
  const policy = Array.isArray(story.statePolicy) ? story.statePolicy : []
  return policy.find((item: any) => item?.path === `/custom/${key}`)
}

function stateLabel(story: JsonRecord, key: string) {
  const policy = statePolicyFor(story, key)
  const schema = customSchemaProperties(story)[key]
  return String(policy?.label || schema?.title || key)
}

function stateDescription(story: JsonRecord, key: string) {
  const schema = customSchemaProperties(story)[key]
  return typeof schema?.description === 'string' && schema.description.trim() ? schema.description.trim() : ''
}

export function nodeProgressStatus(state: JsonRecord, nodeId: string) {
  const custom = isRecord(state.custom) ? state.custom : {}
  const progress = isRecord(custom.nodeProgress) ? custom.nodeProgress[nodeId] : null
  return isRecord(progress) && typeof progress.status === 'string' ? progress.status : 'inactive'
}

export function collectDynamicStateRecords(input: {
  story: JsonRecord
  state: JsonRecord
  abilities: JsonRecord[]
  nodes: JsonRecord[]
}) {
  const records: string[] = []
  const custom = isRecord(input.state.custom) ? input.state.custom : {}
  const storyCustom = storyCustomState(custom)

  for (const key of Object.keys(storyCustom).sort()) {
    const description = stateDescription(input.story, key)
    const policy = statePolicyFor(input.story, key)
    const protection =
      policy?.appManaged || policy?.storyEditable === false || policy?.playerEditable === false
        ? '；该字段受策略保护'
        : ''
    records.push(
      `状态 ${stateLabel(input.story, key)}（${key}）：${compactJson(storyCustom[key])}${
        description ? `；说明：${description}` : ''
      }${protection}`,
    )
  }

  const pendingSuggestions = Array.isArray(custom.stateSuggestions)
    ? custom.stateSuggestions.filter((item: any) => item?.status === 'pending').slice(-5)
    : []
  for (const suggestion of pendingSuggestions) {
    records.push(
      `待确认状态建议：${suggestion.title || '未命名建议'}${
        suggestion.summary ? `。${suggestion.summary}` : ''
      }；建议变更 ${compactJson(suggestion.patch || {})}`,
    )
  }

  const abilityUses = isRecord(custom.abilityUses) ? custom.abilityUses : {}
  const abilityNames = new Map(
    input.abilities.map((ability) => [String(ability.id), String(ability.name || ability.id)]),
  )
  for (const [abilityId, use] of Object.entries(abilityUses)) {
    if (!isRecord(use)) continue
    records.push(
      `能力使用：${abilityNames.get(abilityId) || abilityId} 已使用 ${Number(use.count || 0)} 次${
        use.lastUsedAtDepth !== undefined ? `；上次使用深度 ${Number(use.lastUsedAtDepth)}` : ''
      }`,
    )
  }

  const nodeProgress = isRecord(custom.nodeProgress) ? custom.nodeProgress : {}
  const nodeTitles = new Map(input.nodes.map((node) => [String(node.id), String(node.title || node.id)]))
  for (const [nodeId, progress] of Object.entries(nodeProgress)) {
    if (!isRecord(progress)) continue
    const status = typeof progress.status === 'string' ? progress.status : 'inactive'
    records.push(`节点进度：${nodeTitles.get(nodeId) || nodeId} ${statusLabels[status] || status}`)
  }

  return records
}
