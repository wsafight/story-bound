import { db } from '../../db/connection'
import { parseJson } from '../../repositories/conversations'
import { diagnoseLorebookEntries } from '../prompt/lorebook'
import { requireConversation } from './guards'

type Row = Record<string, unknown>
type JsonRecord = Record<string, any>

function activeCharacters(story: JsonRecord, scene: JsonRecord, state: JsonRecord) {
  const characters = Array.isArray(story.characters) ? story.characters : []
  const participantIds = new Set<string>(state?.scene?.participantIds || scene.participantIds || [])
  const active = characters.filter((character: any) => participantIds.has(String(character.id)))
  if (active.length > 0) return active
  const main = characters.find((character: any) => character.roleType === 'main')
  return main ? [main] : []
}

function currentChapterNumber(conversation: Row, conversationId: string) {
  if (!conversation.current_chapter_id) return null
  const row = db
    .query('SELECT number FROM chapters WHERE id = ? AND conversation_id = ?')
    .get(String(conversation.current_chapter_id), conversationId) as Row | null
  return row ? Number(row.number) : null
}

function fallbackInput(conversationId: string, activeLeafMessageId: unknown) {
  if (!activeLeafMessageId) return ''
  const row = db
    .query('SELECT content FROM messages WHERE id = ? AND conversation_id = ?')
    .get(String(activeLeafMessageId), conversationId) as Row | null
  return row ? String(row.content || '') : ''
}

export function getLorebookDiagnostics(conversationId: string, currentInput = '') {
  const conversation = requireConversation(conversationId)
  const story = parseJson<JsonRecord>(conversation.card_snapshot_json, {})
  const scene = parseJson<JsonRecord>(conversation.scene_snapshot_json, {})
  const state = parseJson<JsonRecord>(conversation.state_json, {})
  const entries = Array.isArray(story.lorebookEntries) ? story.lorebookEntries : []
  return diagnoseLorebookEntries({
    entries,
    state,
    scene,
    activeCharacters: activeCharacters(story, scene, state),
    currentInput: currentInput || fallbackInput(conversationId, conversation.active_leaf_message_id),
    currentChapterNumber: currentChapterNumber(conversation, conversationId),
  }).map((diagnostic) => ({
    entryId: diagnostic.entryId,
    title: diagnostic.title,
    scope: diagnostic.scope,
    priority: diagnostic.priority,
    enabled: diagnostic.enabled,
    matched: diagnostic.matched,
    matchedKeywords: diagnostic.matchedKeywords,
    reasons: diagnostic.reasons,
  }))
}
