import type { Database } from 'bun:sqlite'
import { db, newId, nowIso } from '../db/connection'
import type { UpdateConversationModInput, UpdateRuntimeModInput } from '../domain/schemas'
import { getConversationRow, parseJson } from '../repositories/conversations'
import { getTrustedMod, trustedMods, validateModConfigForStory } from '../runtime/modCatalog'
import { getManagedStoryboundPluginStatus, setManagedStoryboundPlugin } from '../runtime/storyboundRuntime'
import { AppError } from '../shared/errors'

type Row = Record<string, unknown>

export type ActiveModSnapshot = Record<string, { version: string; config: Record<string, unknown> }>

function requireTrustedMod(modId: string) {
  const definition = getTrustedMod(modId)
  if (!definition) throw new AppError(404, 'MOD_NOT_FOUND', '没有找到这个受信任 MOD')
  return definition
}

export function ensureRuntimeModRows(database: Database = db) {
  const insert = database.query(`
    INSERT OR IGNORE INTO runtime_mods (id, enabled, default_config_json, config_version, updated_at)
    VALUES (?, 1, ?, 1, ?)
  `)
  const timestamp = nowIso()
  const seed = database.transaction(() => {
    for (const mod of trustedMods) insert.run(mod.id, JSON.stringify(mod.defaultConfig), timestamp)
  })
  seed()
}

function runtimeModRow(modId: string) {
  ensureRuntimeModRows()
  return db.query('SELECT * FROM runtime_mods WHERE id = ?').get(modId) as Row | null
}

function activeConversationCount(modId: string) {
  const row = db
    .query(`
    SELECT COUNT(*) AS count
    FROM conversation_mods cm
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.mod_id = ? AND cm.enabled = 1 AND c.status != 'trashed'
  `)
    .get(modId) as Row
  return Number(row.count) || 0
}

function mapRuntimeMod(definition: (typeof trustedMods)[number], row: Row) {
  const runtime = getManagedStoryboundPluginStatus(definition.id)
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    version: definition.version,
    activationPolicy: definition.activationPolicy,
    configFields: definition.configFields,
    enabled: Boolean(row.enabled),
    defaultConfig: definition.schema.parse(
      parseJson<Record<string, unknown>>(row.default_config_json, definition.defaultConfig),
    ),
    configVersion: Number(row.config_version),
    activeConversations: activeConversationCount(definition.id),
    runtime,
  }
}

export function listRuntimeMods() {
  ensureRuntimeModRows()
  const rows = new Map((db.query('SELECT * FROM runtime_mods').all() as Row[]).map((row) => [String(row.id), row]))
  return trustedMods.map((definition) => mapRuntimeMod(definition, rows.get(definition.id)!))
}

export async function startTrustedMods() {
  ensureRuntimeModRows()
  for (const definition of trustedMods) {
    const row = runtimeModRow(definition.id)!
    await setManagedStoryboundPlugin(
      definition.id,
      definition.plugin,
      Boolean(row.enabled),
      definition.schema.parse(parseJson(row.default_config_json, definition.defaultConfig)),
    )
  }
}

export async function updateRuntimeMod(modId: string, input: UpdateRuntimeModInput) {
  const definition = requireTrustedMod(modId)
  const row = runtimeModRow(modId)!
  const enabled = input.enabled ?? Boolean(row.enabled)
  if (!enabled && activeConversationCount(modId) > 0) {
    throw new AppError(409, 'MOD_IN_USE', '仍有存档启用了这个 MOD，请先在对应故事中停用')
  }
  const currentConfig = definition.schema.parse(
    parseJson<Record<string, unknown>>(row.default_config_json, definition.defaultConfig),
  )
  const defaultConfig = definition.schema.parse(input.defaultConfig ?? currentConfig)
  if (
    modId === 'narrative-perspective' &&
    (defaultConfig.perspective === 'first_character' || defaultConfig.perspective === 'third_character')
  ) {
    throw new AppError(422, 'MOD_CONFIG_REQUIRES_STORY', '指定人物视角需要在具体故事存档中设置')
  }

  await setManagedStoryboundPlugin(definition.id, definition.plugin, enabled, defaultConfig)
  db.query(`
    UPDATE runtime_mods
    SET enabled = ?, default_config_json = ?, config_version = config_version + 1, updated_at = ?
    WHERE id = ?
  `).run(enabled ? 1 : 0, JSON.stringify(defaultConfig), nowIso(), modId)
  return listRuntimeMods().find((mod) => mod.id === modId)!
}

export function getModSnapshot(conversationId: string, checkpointId?: string): ActiveModSnapshot {
  if (checkpointId) {
    const checkpoint = db
      .query('SELECT mod_snapshot_json FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
      .get(checkpointId, conversationId) as Row | null
    if (!checkpoint) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法读取当前 MOD 检查点')
    return parseJson<ActiveModSnapshot>(checkpoint.mod_snapshot_json, {})
  }
  const conversation = getConversationRow(conversationId)
  if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
  return parseJson<ActiveModSnapshot>(conversation.mod_snapshot_json, {})
}

export function listConversationMods(conversationId: string) {
  const conversation = getConversationRow(conversationId)
  if (!conversation || conversation.status === 'trashed')
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
  const current = getModSnapshot(conversationId)
  return listRuntimeMods().map((mod) => ({
    ...mod,
    active: Boolean(current[mod.id]),
    config: current[mod.id] ? requireTrustedMod(mod.id).schema.parse(current[mod.id]?.config || {}) : mod.defaultConfig,
  }))
}

export function updateConversationMod(conversationId: string, modId: string, input: UpdateConversationModInput) {
  const definition = requireTrustedMod(modId)
  if (definition.activationPolicy !== 'immediate') {
    throw new AppError(409, 'MOD_REQUIRES_CHAPTER_BOUNDARY', '这个 MOD 只能在新章节开始时生效')
  }
  const runtimeRow = runtimeModRow(modId)!
  if (input.enabled && !runtimeRow.enabled) throw new AppError(409, 'MOD_NOT_AVAILABLE', '这个 MOD 当前未加载')

  return db.transaction(() => {
    const conversation = getConversationRow(conversationId)
    if (!conversation || conversation.status === 'trashed')
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
    if (conversation.status !== 'active') throw new AppError(409, 'CONVERSATION_NOT_ACTIVE', '这个存档当前不能修改 MOD')
    if (
      conversation.active_leaf_message_id !== input.expectedLeafMessageId ||
      conversation.active_checkpoint_id !== input.expectedCheckpointId
    ) {
      throw new AppError(409, 'CONVERSATION_CHANGED', '剧情或 MOD 配置已经变化，请刷新后重试')
    }
    const activeGeneration = db
      .query("SELECT id FROM generations WHERE conversation_id = ? AND status IN ('accepted', 'streaming')")
      .get(conversationId)
    if (activeGeneration) throw new AppError(409, 'GENERATION_ACTIVE', '生成回复时不能修改 MOD')

    const checkpoint = db
      .query('SELECT * FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
      .get(input.expectedCheckpointId, conversationId) as Row | null
    if (!checkpoint) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法读取当前故事检查点')

    const snapshot = parseJson<ActiveModSnapshot>(conversation.mod_snapshot_json, {})
    const previous = snapshot[modId]
    const card = parseJson<Record<string, any>>(conversation.card_snapshot_json, {})
    const config = input.enabled
      ? validateModConfigForStory(
          modId,
          Object.keys(input.config).length > 0
            ? input.config
            : previous?.config || parseJson(runtimeRow.default_config_json, definition.defaultConfig),
          Array.isArray(card.characters) ? card.characters : [],
        )
      : previous?.config || definition.schema.parse(parseJson(runtimeRow.default_config_json, definition.defaultConfig))
    const unchanged =
      input.enabled === Boolean(previous) &&
      (!input.enabled || JSON.stringify(previous?.config) === JSON.stringify(config))
    if (unchanged) {
      return {
        mod: listConversationMods(conversationId).find((mod) => mod.id === modId)!,
        event: null,
        activeCheckpointId: input.expectedCheckpointId,
      }
    }

    if (input.enabled) snapshot[modId] = { version: definition.version, config }
    else delete snapshot[modId]

    const timestamp = nowIso()
    const checkpointId = newId()
    db.query(`
      INSERT INTO runtime_checkpoints (
        id, conversation_id, parent_checkpoint_id, anchor_message_id,
        state_json, ability_snapshot_json, mod_snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      checkpointId,
      conversationId,
      input.expectedCheckpointId,
      input.expectedLeafMessageId,
      String(checkpoint.state_json),
      String(checkpoint.ability_snapshot_json),
      JSON.stringify(snapshot),
      timestamp,
    )
    db.query(
      'UPDATE conversations SET active_checkpoint_id = ?, mod_snapshot_json = ?, updated_at = ? WHERE id = ?',
    ).run(checkpointId, JSON.stringify(snapshot), timestamp, conversationId)
    db.query(`
      INSERT INTO conversation_mods (conversation_id, mod_id, enabled, config_json, activated_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (conversation_id, mod_id) DO UPDATE SET
        enabled = excluded.enabled,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `).run(conversationId, modId, input.enabled ? 1 : 0, JSON.stringify(config), timestamp, timestamp)

    const kind = input.enabled ? (previous ? 'mod_configured' : 'mod_enabled') : 'mod_disabled'
    const eventId = newId()
    const payload = { modId, modName: definition.name, version: definition.version, config }
    db.query(`
      INSERT INTO conversation_events (
        id, conversation_id, anchor_message_id, runtime_checkpoint_id, kind, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, conversationId, input.expectedLeafMessageId, checkpointId, kind, JSON.stringify(payload), timestamp)

    return {
      mod: listConversationMods(conversationId).find((mod) => mod.id === modId)!,
      event: {
        id: eventId,
        conversationId,
        anchorMessageId: input.expectedLeafMessageId,
        checkpointId,
        kind,
        payload,
        createdAt: timestamp,
      },
      activeCheckpointId: checkpointId,
    }
  })()
}
