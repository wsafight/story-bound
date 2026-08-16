import type { Database } from 'bun:sqlite'
import { db } from '../db/connection'

type JsonRecord = Record<string, unknown>

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapCharacter(row: JsonRecord) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    roleType: row.role_type,
    identity: row.identity_text,
    appearance: row.appearance,
    personality: row.personality,
    speechStyle: row.speech_style,
    goals: row.goals,
    knowledgeScope: row.knowledge_scope,
  }
}

function mapAbility(row: JsonRecord) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    prompt: row.prompt,
    enabledByDefault: Boolean(row.enabled_by_default),
    configSchema: parseJson(row.config_schema_json, {} as Record<string, unknown>),
    inputSchema: parseJson(row.input_schema_json, {} as Record<string, unknown>),
    resultSchema: parseJson(row.result_schema_json, {} as Record<string, unknown>),
    runtime: parseJson(row.runtime_json, { usesPerConversation: null, cooldownTurns: 0, statePatch: {} }),
  }
}

function mapScene(row: JsonRecord) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    time: row.time_label,
    participantIds: parseJson(row.participant_ids_json, [] as string[]),
    entryMethod: row.entry_method,
    openingMessage: row.opening_message,
    openingSender: row.opening_sender,
    openingCharacterId: row.opening_character_id,
    initialState: parseJson(row.initial_state_json, {}),
    isDefault: Boolean(row.is_default),
  }
}

export function listStories(database: Database = db) {
  const rows = database
    .query(`
    SELECT
      s.*,
      (SELECT COUNT(*) FROM conversations c WHERE c.story_card_id = s.id AND c.status != 'trashed') AS conversation_count,
      (SELECT MAX(c.updated_at) FROM conversations c WHERE c.story_card_id = s.id AND c.status != 'trashed') AS last_played_at,
      (SELECT c.id FROM conversations c WHERE c.story_card_id = s.id AND c.status = 'active' ORDER BY c.updated_at DESC LIMIT 1) AS recent_conversation_id
    FROM story_cards s
    WHERE s.status IN ('active', 'draft')
    ORDER BY COALESCE(last_played_at, s.updated_at) DESC, s.title
  `)
    .all() as JsonRecord[]

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    cover: row.cover,
    summary: row.summary,
    tags: parseJson(row.tags_json, [] as string[]),
    conversationCount: Number(row.conversation_count || 0),
    lastPlayedAt: row.last_played_at,
    recentConversationId: row.recent_conversation_id || null,
    isBuiltin: Boolean(row.is_builtin),
    status: row.status,
  }))
}

export function getStory(storyId: string, includeDraft = false, database: Database = db) {
  const row = includeDraft
    ? (database
        .query("SELECT * FROM story_cards WHERE id = ? AND status != 'trashed'")
        .get(storyId) as JsonRecord | null)
    : (database
        .query('SELECT * FROM story_cards WHERE id = ? AND status = ?')
        .get(storyId, 'active') as JsonRecord | null)
  if (!row) return null

  const characters = (
    database
      .query('SELECT * FROM characters WHERE story_card_id = ? ORDER BY sort_order, name')
      .all(storyId) as JsonRecord[]
  ).map(mapCharacter)
  const abilities = (
    database
      .query('SELECT * FROM abilities WHERE story_card_id = ? ORDER BY sort_order, name')
      .all(storyId) as JsonRecord[]
  ).map(mapAbility)
  const scenes = (
    database
      .query('SELECT * FROM scenes WHERE story_card_id = ? ORDER BY is_default DESC, sort_order, title')
      .all(storyId) as JsonRecord[]
  ).map(mapScene)
  const playerRow = database
    .query('SELECT * FROM player_templates WHERE story_card_id = ?')
    .get(storyId) as JsonRecord | null
  const conversationCount = Number(
    (
      database
        .query("SELECT COUNT(*) AS count FROM conversations WHERE story_card_id = ? AND status != 'trashed'")
        .get(storyId) as JsonRecord
    ).count,
  )

  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    summary: row.summary,
    description: row.description,
    background: row.background,
    worldRules: row.world_rules,
    contentWarnings: parseJson(row.content_warnings_json, [] as string[]),
    contentBoundaries: parseJson(row.content_boundaries_json, [] as string[]),
    tags: parseJson(row.tags_json, [] as string[]),
    version: row.version,
    stateSchema: parseJson(row.state_schema_json, {} as Record<string, unknown>),
    defaultState: parseJson(row.default_state_json, {} as Record<string, unknown>),
    statePolicy: parseJson(row.state_policy_json, [] as Array<Record<string, unknown>>),
    facts: parseJson(row.facts_json, [] as Array<Record<string, unknown>>),
    lorebookEntries: parseJson(row.lorebook_entries_json, [] as Array<Record<string, unknown>>),
    nodes: parseJson(row.nodes_json, [] as Array<Record<string, unknown>>),
    declarativeMods: parseJson(row.declarative_mods_json, [] as Array<Record<string, unknown>>),
    isBuiltin: Boolean(row.is_builtin),
    status: row.status,
    characters,
    abilities,
    scenes,
    playerTemplate: playerRow
      ? {
          id: playerRow.id,
          roleName: playerRow.role_name,
          background: playerRow.background,
          goals: playerRow.goals,
          defaultValues: parseJson(playerRow.default_values_json, {} as Record<string, string>),
        }
      : null,
    conversationCount,
  }
}

export function listStoryConversations(storyId: string, database: Database = db) {
  return (
    database
      .query(`
    SELECT id, title, status, state_json, created_at, updated_at
    FROM conversations
    WHERE story_card_id = ? AND status != 'trashed'
    ORDER BY updated_at DESC
  `)
      .all(storyId) as JsonRecord[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    state: parseJson(row.state_json, {} as Record<string, unknown>),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export type StoryDetail = NonNullable<ReturnType<typeof getStory>>

export class StoriesRepository {
  constructor(private readonly database: Database) {}

  list() {
    return listStories(this.database)
  }

  get(storyId: string, includeDraft = false) {
    return getStory(storyId, includeDraft, this.database)
  }

  listConversations(storyId: string) {
    return listStoryConversations(storyId, this.database)
  }
}
