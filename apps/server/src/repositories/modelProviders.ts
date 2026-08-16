import type { Database } from 'bun:sqlite'
import { config } from '../config'
import { db, newId, nowIso } from '../db/connection'

type Row = Record<string, unknown>

export interface ModelProviderSnapshot {
  providerId: string
  credentialRef: string
  name: string
  kind: 'local' | 'remote'
  baseUrl: string
  model: string
  contextWindow: number
  maxOutputTokens: number
  thinkingMode: 'off' | 'auto' | 'on'
  thinkingEffort: 'low' | 'medium' | 'high' | null
  temperature: number
}

function mapProvider(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as 'local' | 'remote',
    baseUrl: String(row.base_url),
    defaultModel: String(row.default_model),
    contextWindow: Number(row.context_window),
    maxOutputTokens: Number(row.max_output_tokens),
    thinkingMode: row.thinking_mode as 'off' | 'auto' | 'on',
    thinkingEffort: (row.thinking_effort || null) as 'low' | 'medium' | 'high' | null,
    isDefault: Boolean(row.is_default),
    hasCredential: Boolean(row.has_credential),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

const providerSelect = `
  SELECT p.*, CASE WHEN c.api_key IS NOT NULL AND c.api_key != '' THEN 1 ELSE 0 END AS has_credential
  FROM model_providers p
  LEFT JOIN model_credentials c ON c.id = p.credential_id
`

export function listModelProviders(database: Database = db) {
  return (database.query(`${providerSelect} ORDER BY p.is_default DESC, p.created_at`).all() as Row[]).map(mapProvider)
}

export function getModelProvider(providerId: string, database: Database = db) {
  const row = database.query(`${providerSelect} WHERE p.id = ?`).get(providerId) as Row | null
  return row ? mapProvider(row) : null
}

export function getProviderCredential(credentialRef: string, database: Database = db) {
  const versioned = database
    .query('SELECT api_key FROM model_credentials WHERE id = ?')
    .get(credentialRef) as Row | null
  if (versioned) return String(versioned.api_key)
  const legacy = database
    .query('SELECT api_key FROM model_provider_credentials WHERE provider_id = ?')
    .get(credentialRef) as Row | null
  return legacy ? String(legacy.api_key) : ''
}

export function getDefaultProviderSnapshot(database: Database = db): ModelProviderSnapshot {
  const row = database.query(`${providerSelect} ORDER BY p.is_default DESC, p.created_at LIMIT 1`).get() as Row | null
  if (!row) throw new Error('MODEL_PROVIDER_MISSING')
  return snapshotFromProvider(mapProvider(row), database)
}

export function snapshotFromProvider(
  provider: ReturnType<typeof mapProvider>,
  database: Database = db,
): ModelProviderSnapshot {
  const credential = database
    .query('SELECT credential_id FROM model_providers WHERE id = ?')
    .get(provider.id) as Row | null
  return {
    providerId: provider.id,
    credentialRef: String(credential?.credential_id || provider.id),
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    model: provider.defaultModel,
    contextWindow: provider.contextWindow,
    maxOutputTokens: provider.maxOutputTokens,
    thinkingMode: provider.thinkingMode,
    thinkingEffort: provider.thinkingEffort,
    temperature: 0.8,
  }
}

export function createModelProvider(
  input: {
    name: string
    kind: 'local' | 'remote'
    baseUrl: string
    apiKey?: string
    defaultModel: string
    contextWindow: number
    maxOutputTokens: number
    thinkingMode: 'off' | 'auto' | 'on'
    thinkingEffort: 'low' | 'medium' | 'high' | null
  },
  database: Database = db,
) {
  const id = newId()
  const credentialId = newId()
  const timestamp = nowIso()
  database.transaction(() => {
    const count = Number((database.query('SELECT COUNT(*) AS count FROM model_providers').get() as Row).count)
    database
      .query(`
      INSERT INTO model_providers (
        id, name, kind, base_url, default_model, context_window, max_output_tokens,
        thinking_mode, thinking_effort, is_default, created_at, updated_at, credential_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        id,
        input.name,
        input.kind,
        input.baseUrl,
        input.defaultModel,
        input.contextWindow,
        input.maxOutputTokens,
        input.thinkingMode,
        input.thinkingEffort,
        count === 0 ? 1 : 0,
        timestamp,
        timestamp,
        null,
      )
    database
      .query('INSERT INTO model_credentials (id, provider_id, api_key, created_at) VALUES (?, ?, ?, ?)')
      .run(credentialId, id, input.apiKey || '', timestamp)
    database.query('UPDATE model_providers SET credential_id = ? WHERE id = ?').run(credentialId, id)
  })()
  return getModelProvider(id, database)!
}

export function updateModelProvider(providerId: string, input: Record<string, unknown>, database: Database = db) {
  const current = getModelProvider(providerId, database)
  if (!current) return null
  const timestamp = nowIso()
  const next = {
    name: typeof input.name === 'string' ? input.name : current.name,
    kind: input.kind === 'local' || input.kind === 'remote' ? input.kind : current.kind,
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl : current.baseUrl,
    defaultModel: typeof input.defaultModel === 'string' ? input.defaultModel : current.defaultModel,
    contextWindow: typeof input.contextWindow === 'number' ? input.contextWindow : current.contextWindow,
    maxOutputTokens: typeof input.maxOutputTokens === 'number' ? input.maxOutputTokens : current.maxOutputTokens,
    thinkingMode:
      input.thinkingMode === 'off' || input.thinkingMode === 'auto' || input.thinkingMode === 'on'
        ? input.thinkingMode
        : current.thinkingMode,
    thinkingEffort:
      input.thinkingEffort === null ||
      input.thinkingEffort === 'low' ||
      input.thinkingEffort === 'medium' ||
      input.thinkingEffort === 'high'
        ? input.thinkingEffort
        : current.thinkingEffort,
  }
  database.transaction(() => {
    database
      .query(`
      UPDATE model_providers SET name = ?, kind = ?, base_url = ?, default_model = ?,
        context_window = ?, max_output_tokens = ?, thinking_mode = ?, thinking_effort = ?, updated_at = ?
      WHERE id = ?
    `)
      .run(
        next.name,
        next.kind,
        next.baseUrl,
        next.defaultModel,
        next.contextWindow,
        next.maxOutputTokens,
        next.thinkingMode,
        next.thinkingEffort,
        timestamp,
        providerId,
      )
    if (typeof input.apiKey === 'string') {
      const credentialId = newId()
      database
        .query('INSERT INTO model_credentials (id, provider_id, api_key, created_at) VALUES (?, ?, ?, ?)')
        .run(credentialId, providerId, input.apiKey, timestamp)
      database.query('UPDATE model_providers SET credential_id = ? WHERE id = ?').run(credentialId, providerId)
    }
  })()
  return getModelProvider(providerId, database)
}

export function setDefaultModelProvider(providerId: string, database: Database = db) {
  if (!getModelProvider(providerId, database)) return null
  database.transaction(() => {
    database.query('UPDATE model_providers SET is_default = 0 WHERE is_default = 1').run()
    database.query('UPDATE model_providers SET is_default = 1, updated_at = ? WHERE id = ?').run(nowIso(), providerId)
  })()
  return getModelProvider(providerId, database)
}

export function deleteModelProvider(providerId: string, database: Database = db) {
  const provider = getModelProvider(providerId, database)
  if (!provider) return false
  const count = Number((database.query('SELECT COUNT(*) AS count FROM model_providers').get() as Row).count)
  const conversationCount = Number(
    (
      database
        .query(`
    SELECT COUNT(*) AS count FROM conversations
    WHERE json_extract(model_config_json, '$.providerId') = ? AND status != 'trashed'
  `)
        .get(providerId) as Row
    ).count,
  )
  if (count <= 1 || provider.isDefault || conversationCount > 0) return false
  return database.query('DELETE FROM model_providers WHERE id = ?').run(providerId).changes > 0
}

export function seedDefaultModelProvider(database: Database = db) {
  const count = Number((database.query('SELECT COUNT(*) AS count FROM model_providers').get() as Row).count)
  if (count > 0) return
  createModelProvider(
    {
      name: '本地模型',
      kind: 'local',
      baseUrl: config.llmBaseUrl,
      apiKey: config.llmApiKey,
      defaultModel: config.llmModel,
      contextWindow: 32_768,
      maxOutputTokens: 1_600,
      thinkingMode: 'auto',
      thinkingEffort: null,
    },
    database,
  )
}

export class ModelProvidersRepository {
  constructor(private readonly database: Database) {}

  list() {
    return listModelProviders(this.database)
  }
  get(providerId: string) {
    return getModelProvider(providerId, this.database)
  }
  credential(credentialRef: string) {
    return getProviderCredential(credentialRef, this.database)
  }
  defaultSnapshot() {
    return getDefaultProviderSnapshot(this.database)
  }
  snapshot(provider: NonNullable<ReturnType<typeof getModelProvider>>) {
    return snapshotFromProvider(provider, this.database)
  }
  create(input: Parameters<typeof createModelProvider>[0]) {
    return createModelProvider(input, this.database)
  }
  update(providerId: string, input: Record<string, unknown>) {
    return updateModelProvider(providerId, input, this.database)
  }
  setDefault(providerId: string) {
    return setDefaultModelProvider(providerId, this.database)
  }
  delete(providerId: string) {
    return deleteModelProvider(providerId, this.database)
  }
}
