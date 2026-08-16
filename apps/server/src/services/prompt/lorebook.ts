import { storyConditionMatches } from '../storyConditions'

type JsonRecord = Record<string, any>

const priorityWeight = { high: 3, medium: 2, low: 1 }
const validScopes = new Set(['story', 'scene', 'character', 'chapter'])

function normalized(value: unknown) {
  return String(value || '').toLowerCase()
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sceneText(scene: JsonRecord, state: JsonRecord) {
  const stateScene = isRecord(state.scene) ? state.scene : {}
  return [
    scene.title,
    scene.description,
    state.phase,
    stateScene.location || scene.location,
    stateScene.time || scene.time,
  ]
    .filter(Boolean)
    .join('\n')
}

export function collectLorebookEntries(input: {
  entries: JsonRecord[]
  state: JsonRecord
  scene: JsonRecord
  activeCharacters: JsonRecord[]
  currentInput: string
  currentChapterNumber?: number | null
}) {
  return diagnoseLorebookEntries(input)
    .filter((diagnostic) => diagnostic.matched)
    .map((diagnostic) => diagnostic.entry)
    .sort(
      (left, right) =>
        (priorityWeight[right.priority as keyof typeof priorityWeight] || 2) -
          (priorityWeight[left.priority as keyof typeof priorityWeight] || 2) ||
        String(left.title || '').localeCompare(String(right.title || '')),
    )
}

export function diagnoseLorebookEntries(input: {
  entries: JsonRecord[]
  state: JsonRecord
  scene: JsonRecord
  activeCharacters: JsonRecord[]
  currentInput: string
  currentChapterNumber?: number | null
}) {
  const haystack = normalized(
    [
      input.currentInput,
      sceneText(input.scene, input.state),
      input.activeCharacters.map((character) => `${character.name || ''}\n${character.identity || ''}`).join('\n'),
    ].join('\n'),
  )
  const sceneId = String(input.scene.id || '')
  const activeCharacterIds = new Set(input.activeCharacters.map((character) => String(character.id)))
  return input.entries.map((entry) => {
    const reasons: Array<
      'matched' | 'disabled' | 'scope_not_matched' | 'condition_not_matched' | 'keyword_not_matched'
    > = []
    const scope = validScopes.has(String(entry.scope)) ? String(entry.scope) : 'story'
    if (entry.enabled === false) reasons.push('disabled')
    if (
      !scopeMatches({ entry, scope, sceneId, activeCharacterIds, currentChapterNumber: input.currentChapterNumber })
    ) {
      reasons.push('scope_not_matched')
    }
    if (!storyConditionMatches(entry.condition, input.state)) reasons.push('condition_not_matched')
    const keywords = Array.isArray(entry.keywords) ? entry.keywords.map(normalized).filter(Boolean) : []
    const matchedKeywords = keywords.filter((keyword) => haystack.includes(keyword))
    if (keywords.length > 0 && matchedKeywords.length === 0) reasons.push('keyword_not_matched')
    const matched = reasons.length === 0
    if (matched) reasons.push('matched')
    return {
      entry,
      entryId: String(entry.id || ''),
      title: String(entry.title || '未命名资料'),
      scope,
      priority: String(entry.priority || 'medium'),
      enabled: entry.enabled !== false,
      matched,
      matchedKeywords,
      reasons,
    }
  })
}

export function renderLorebookEntry(entry: JsonRecord) {
  const keywords =
    Array.isArray(entry.keywords) && entry.keywords.length > 0 ? `；触发词：${entry.keywords.join('、')}` : ''
  return `资料：${entry.title || '未命名资料'}${keywords}\n${entry.content || ''}`
}

function scopeMatches(input: {
  entry: JsonRecord
  scope: string
  sceneId: string
  activeCharacterIds: Set<string>
  currentChapterNumber?: number | null
}) {
  if (input.scope === 'story') return true
  if (input.scope === 'scene') {
    const sceneIds = Array.isArray(input.entry.sceneIds) ? input.entry.sceneIds.map(String) : []
    return sceneIds.length > 0 && sceneIds.includes(input.sceneId)
  }
  if (input.scope === 'character') {
    const characterIds = Array.isArray(input.entry.characterIds) ? input.entry.characterIds.map(String) : []
    return characterIds.length > 0 && characterIds.some((id) => input.activeCharacterIds.has(id))
  }
  if (input.scope === 'chapter') {
    const chapterNumbers = Array.isArray(input.entry.chapterNumbers)
      ? input.entry.chapterNumbers.map(Number).filter(Number.isFinite)
      : []
    return Boolean(input.currentChapterNumber && chapterNumbers.includes(input.currentChapterNumber))
  }
  return false
}
