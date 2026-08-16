import type { Database } from 'bun:sqlite'

const currentSchema = `
  CREATE TABLE IF NOT EXISTS story_cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    cover TEXT,
    summary TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    world_rules TEXT NOT NULL DEFAULT '',
    content_warnings_json TEXT NOT NULL DEFAULT '[]',
    content_boundaries_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    default_model_config_json TEXT NOT NULL DEFAULT '{}',
    state_schema_json TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}',
    default_state_json TEXT NOT NULL DEFAULT '{}',
    state_policy_json TEXT NOT NULL DEFAULT '[]',
    facts_json TEXT NOT NULL DEFAULT '[]',
    lorebook_entries_json TEXT NOT NULL DEFAULT '[]',
    nodes_json TEXT NOT NULL DEFAULT '[]',
    declarative_mods_json TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'trashed')),
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    story_card_id TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT,
    role_type TEXT NOT NULL CHECK (role_type IN ('main', 'supporting', 'background')),
    identity_text TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT '',
    personality TEXT NOT NULL DEFAULT '',
    speech_style TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    knowledge_scope TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS player_templates (
    id TEXT PRIMARY KEY,
    story_card_id TEXT NOT NULL UNIQUE REFERENCES story_cards(id) ON DELETE CASCADE,
    role_name TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    default_values_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS abilities (
    id TEXT PRIMARY KEY,
    story_card_id TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'player' CHECK (category IN ('player', 'character', 'mechanic')),
    description TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    enabled_by_default INTEGER NOT NULL DEFAULT 1,
    config_schema_json TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}',
    input_schema_json TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}',
    result_schema_json TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}',
    runtime_json TEXT NOT NULL DEFAULT '{"usesPerConversation":null,"cooldownTurns":0,"statePatch":{}}',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    story_card_id TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    time_label TEXT NOT NULL DEFAULT '',
    participant_ids_json TEXT NOT NULL DEFAULT '[]',
    entry_method TEXT NOT NULL DEFAULT '',
    opening_message TEXT NOT NULL,
    opening_sender TEXT NOT NULL DEFAULT 'narrator' CHECK (opening_sender IN ('narrator', 'character')),
    opening_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
    initial_state_json TEXT NOT NULL DEFAULT '{}',
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS model_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('local', 'remote')),
    base_url TEXT NOT NULL,
    default_model TEXT NOT NULL,
    context_window INTEGER NOT NULL DEFAULT 32768,
    max_output_tokens INTEGER NOT NULL DEFAULT 1600,
    thinking_mode TEXT NOT NULL DEFAULT 'auto' CHECK (thinking_mode IN ('off', 'auto', 'on')),
    thinking_effort TEXT CHECK (thinking_effort IN ('low', 'medium', 'high') OR thinking_effort IS NULL),
    is_default INTEGER NOT NULL DEFAULT 0,
    credential_id TEXT REFERENCES model_credentials(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_credentials (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_provider_credentials (
    provider_id TEXT PRIMARY KEY REFERENCES model_providers(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    story_card_id TEXT REFERENCES story_cards(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    card_version INTEGER NOT NULL,
    card_snapshot_json TEXT NOT NULL,
    player_snapshot_json TEXT NOT NULL,
    ability_snapshot_json TEXT NOT NULL,
    scene_snapshot_json TEXT NOT NULL,
    model_config_json TEXT NOT NULL DEFAULT '{}',
    state_json TEXT NOT NULL DEFAULT '{}',
    mod_snapshot_json TEXT NOT NULL DEFAULT '{}',
    current_chapter_id TEXT,
    active_leaf_message_id TEXT,
    active_checkpoint_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'trashed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at TEXT NOT NULL,
    UNIQUE (conversation_id, number)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    client_message_id TEXT,
    parent_message_id TEXT REFERENCES messages(id),
    generation_id TEXT,
    runtime_checkpoint_id TEXT,
    sender TEXT NOT NULL CHECK (sender IN ('player', 'character', 'narrator')),
    character_id TEXT,
    input_mode TEXT CHECK (input_mode IN ('dialogue', 'action', 'narration') OR input_mode IS NULL),
    content TEXT NOT NULL,
    tree_depth INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runtime_checkpoints (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_checkpoint_id TEXT REFERENCES runtime_checkpoints(id),
    anchor_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL,
    ability_snapshot_json TEXT NOT NULL,
    mod_snapshot_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    player_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL DEFAULT 1,
    model TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'streaming', 'completed', 'cancelled', 'failed')),
    error_code TEXT,
    expected_leaf_id TEXT NOT NULL,
    expected_checkpoint_id TEXT NOT NULL,
    provider_id TEXT REFERENCES model_providers(id) ON DELETE SET NULL,
    provider_config_json TEXT NOT NULL DEFAULT '{}',
    finish_reason TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    reasoning_tokens INTEGER,
    first_token_at TEXT,
    provider_request_id TEXT,
    retry_after_ms INTEGER,
    context_estimate_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    UNIQUE (player_message_id, attempt)
  );

  CREATE TABLE IF NOT EXISTS operation_receipts (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL,
    type TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, operation_id)
  );

  CREATE TABLE IF NOT EXISTS runtime_mods (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    default_config_json TEXT NOT NULL DEFAULT '{}',
    config_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_mods (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    mod_id TEXT NOT NULL REFERENCES runtime_mods(id) ON DELETE RESTRICT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    config_json TEXT NOT NULL DEFAULT '{}',
    activated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, mod_id)
  );

  CREATE TABLE IF NOT EXISTS conversation_events (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    anchor_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    runtime_checkpoint_id TEXT REFERENCES runtime_checkpoints(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN (
      'mod_enabled', 'mod_disabled', 'mod_configured',
      'memory_pinned', 'memory_unpinned', 'chapter_closed',
      'state_updated', 'ability_used',
      'state_suggestion_created', 'state_suggestion_accepted', 'state_suggestion_rejected',
      'node_progress_updated',
      'conversation_forked'
    )),
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS story_cards_status_updated_idx ON story_cards(status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS characters_story_idx ON characters(story_card_id, sort_order);
  CREATE INDEX IF NOT EXISTS abilities_story_idx ON abilities(story_card_id, sort_order);
  CREATE INDEX IF NOT EXISTS scenes_story_idx ON scenes(story_card_id, sort_order);
  CREATE INDEX IF NOT EXISTS conversations_story_idx ON conversations(story_card_id, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS messages_parent_idx ON messages(conversation_id, parent_message_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id_idx ON messages(conversation_id, client_message_id) WHERE client_message_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS messages_generation_idx ON messages(generation_id) WHERE generation_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS generations_conversation_idx ON generations(conversation_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS generations_active_idx ON generations(conversation_id) WHERE status IN ('accepted', 'streaming');
  CREATE UNIQUE INDEX IF NOT EXISTS model_providers_default_idx ON model_providers(is_default) WHERE is_default = 1;
  CREATE INDEX IF NOT EXISTS model_credentials_provider_idx ON model_credentials(provider_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS conversation_mods_mod_idx ON conversation_mods(mod_id, enabled);
  DROP INDEX IF EXISTS conversation_events_conversation_idx;
  CREATE INDEX IF NOT EXISTS conversation_events_anchor_idx ON conversation_events(conversation_id, anchor_message_id, created_at);
`

const requiredColumns: Record<string, string[]> = {
  story_cards: [
    'state_schema_json',
    'default_state_json',
    'state_policy_json',
    'facts_json',
    'lorebook_entries_json',
    'nodes_json',
    'declarative_mods_json',
  ],
  abilities: ['config_schema_json', 'input_schema_json', 'result_schema_json', 'runtime_json'],
  conversations: ['mod_snapshot_json', 'active_checkpoint_id'],
  messages: ['tree_depth', 'runtime_checkpoint_id'],
  runtime_checkpoints: ['mod_snapshot_json'],
  generations: ['provider_config_json', 'context_estimate_json'],
  model_providers: ['credential_id'],
}

export function initializeCurrentSchema(database: Database) {
  database.exec(currentSchema)
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const actual = new Set(
      database
        .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
        .all()
        .map((column) => column.name),
    )
    const missing = columns.filter((column) => !actual.has(column))
    if (missing.length > 0) {
      throw new Error(`开发数据库结构已过期：${table} 缺少 ${missing.join(', ')}。请使用当前结构重新创建本地数据库。`)
    }
  }
}
