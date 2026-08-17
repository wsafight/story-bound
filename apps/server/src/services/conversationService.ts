import type { Database } from 'bun:sqlite'
import { createRuntimeStateSchema } from '@storybound/shared/schemas'
import { config } from '../config'
import { db, newId, nowIso } from '../db/connection'
import type { CreateConversationInput } from '../domain/schemas'
import { getDefaultProviderSnapshot, getModelProvider, snapshotFromProvider } from '../repositories/modelProviders'
import { getStory } from '../repositories/stories'
import { getTrustedMod, validateModConfigForStory } from '../runtime/modCatalog'
import { AppError } from '../shared/errors'
import { ensureMemoryCustom } from './conversationManagement/longTermMemory'
import { assertCustomStateMatchesSchema } from './dynamicStateSchema'
import { ensureRuntimeModRows } from './modService'

const runtimeStateSchema = createRuntimeStateSchema({ maxMessageChars: config.maxMessageChars })

type Story = NonNullable<ReturnType<typeof getStory>>
type StoryScene = Story['scenes'][number]

function openingFallbackText(story: Story) {
  const text = [story.description, story.background].filter(Boolean).join('\n\n').trim()
  const opening = text || `${story.title}的故事开始了。`
  return opening.length > config.maxMessageChars ? opening.slice(0, config.maxMessageChars) : opening
}

function createDefaultOpeningScene(story: Story): StoryScene {
  const location = story.summary || story.title
  const time = '故事开始'
  return {
    id: `default-opening:${story.id}`,
    title: '默认开场',
    description: story.summary || '从故事前情进入。',
    location,
    time,
    participantIds: [],
    entryMethod: '从故事前情开始',
    openingMessage: openingFallbackText(story),
    openingSender: 'narrator',
    openingCharacterId: null,
    initialState: {
      phase: '故事开始',
      scene: { location, time, participantIds: [] },
      custom: ensureMemoryCustom(story.defaultState),
    },
    isDefault: true,
  }
}

function resolveOpeningScene(story: Story, sceneId?: string): StoryScene {
  if (sceneId) {
    const scene = story.scenes.find((item) => item.id === sceneId)
    if (scene) return scene
    throw new AppError(422, 'SCENE_INVALID', '开场不属于当前故事卡')
  }
  return story.scenes.find((item) => item.isDefault) || story.scenes[0] || createDefaultOpeningScene(story)
}

export function createConversation(storyId: string, input: CreateConversationInput, database: Database = db) {
  const story = getStory(storyId, false, database)
  if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
  const scene = resolveOpeningScene(story, input.sceneId)
  if (!story.playerTemplate) throw new AppError(422, 'PLAYER_TEMPLATE_MISSING', '故事卡缺少玩家模板')

  const abilityIdSet = new Set(input.abilityIds)
  const abilities = story.abilities.filter((ability) => abilityIdSet.has(String(ability.id)))
  if (abilities.length !== abilityIdSet.size) throw new AppError(422, 'ABILITY_INVALID', '选择了不属于当前故事卡的能力')

  const conversationId = newId()
  const chapterId = newId()
  const openingMessageId = newId()
  const checkpointId = newId()
  const timestamp = nowIso()
  const playerSnapshot = {
    ...story.playerTemplate,
    name: input.player.name,
    pronouns: input.player.pronouns,
    note: input.player.note,
  }
  const cardSnapshot = {
    id: story.id,
    title: story.title,
    cover: story.cover,
    summary: story.summary,
    background: story.background,
    worldRules: story.worldRules,
    contentBoundaries: story.contentBoundaries,
    characters: story.characters,
    facts: story.facts,
    lorebookEntries: story.lorebookEntries,
    nodes: story.nodes,
    declarativeMods: story.declarativeMods,
    stateSchema: story.stateSchema,
    defaultState: story.defaultState,
    statePolicy: story.statePolicy,
    version: story.version,
  }
  const initialStateResult = runtimeStateSchema.safeParse(scene.initialState)
  if (!initialStateResult.success) throw new AppError(422, 'STATE_INVALID', '开场状态格式不正确')
  const initialState = {
    ...initialStateResult.data,
    custom: ensureMemoryCustom(initialStateResult.data.custom),
  }
  assertCustomStateMatchesSchema(story.stateSchema, initialState.custom || {}, '开场自定义状态')
  const selectedProvider = input.providerId ? getModelProvider(input.providerId, database) : null
  if (input.providerId && !selectedProvider) throw new AppError(422, 'PROVIDER_INVALID', '选择的模型 Provider 不存在')
  const modelConfig = selectedProvider
    ? snapshotFromProvider(selectedProvider, database)
    : getDefaultProviderSnapshot(database)
  const narrativeMod = getTrustedMod('narrative-perspective')!
  const narrativeConfig = validateModConfigForStory(narrativeMod.id, input.narrative || {}, story.characters)
  const modSnapshot = {
    [narrativeMod.id]: { version: narrativeMod.version, config: narrativeConfig },
  }
  ensureRuntimeModRows(database)

  const insert = database.transaction(() => {
    database
      .query(`
      INSERT INTO conversations (
        id, story_card_id, title, card_version, card_snapshot_json, player_snapshot_json,
        ability_snapshot_json, scene_snapshot_json, model_config_json, state_json, mod_snapshot_json,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `)
      .run(
        conversationId,
        String(story.id),
        input.title,
        Number(story.version),
        JSON.stringify(cardSnapshot),
        JSON.stringify(playerSnapshot),
        JSON.stringify(abilities),
        JSON.stringify(scene),
        JSON.stringify(modelConfig),
        JSON.stringify(initialState),
        JSON.stringify(modSnapshot),
        timestamp,
        timestamp,
      )
    database
      .query('INSERT INTO chapters (id, conversation_id, number, title, status, created_at) VALUES (?, ?, 1, ?, ?, ?)')
      .run(chapterId, conversationId, '第一章', 'active', timestamp)
    database
      .query(`
      INSERT INTO messages (
        id, conversation_id, chapter_id, parent_message_id, sender, character_id,
        input_mode, content, tree_depth, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, 0, ?)
    `)
      .run(
        openingMessageId,
        conversationId,
        chapterId,
        String(scene.openingSender),
        scene.openingCharacterId ? String(scene.openingCharacterId) : null,
        String(scene.openingMessage),
        timestamp,
      )
    database
      .query(`
      INSERT INTO runtime_checkpoints (
        id, conversation_id, parent_checkpoint_id, anchor_message_id,
        state_json, ability_snapshot_json, mod_snapshot_json, created_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
    `)
      .run(
        checkpointId,
        conversationId,
        openingMessageId,
        JSON.stringify(initialState),
        JSON.stringify(abilities),
        JSON.stringify(modSnapshot),
        timestamp,
      )
    database
      .query(`
      INSERT INTO conversation_mods (
        conversation_id, mod_id, enabled, config_json, activated_at, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?)
    `)
      .run(conversationId, narrativeMod.id, JSON.stringify(narrativeConfig), timestamp, timestamp)
    database.query('UPDATE messages SET runtime_checkpoint_id = ? WHERE id = ?').run(checkpointId, openingMessageId)
    database
      .query(`
      UPDATE conversations
      SET current_chapter_id = ?, active_leaf_message_id = ?, active_checkpoint_id = ?
      WHERE id = ?
    `)
      .run(chapterId, openingMessageId, checkpointId, conversationId)
  })

  insert()
  return { id: conversationId }
}
