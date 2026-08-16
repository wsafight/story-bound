import type { Database } from 'bun:sqlite'
import { db, newId, nowIso } from '../../db/connection'
import type { StoryDraftInput } from '../../domain/schemas'
import { getStory } from '../../repositories/stories'
import { AppError } from '../../shared/errors'
import {
  assertCustomStateMatchesSchema,
  assertValueMatchesSchema,
  compileCustomStateSchema,
} from '../dynamicStateSchema'
import { type PreservedStoryIds, writeStoryChildren } from './children'
import { lintStoryDraft } from './lint'

function validateDynamicState(input: StoryDraftInput) {
  compileCustomStateSchema(input.stateSchema)
  assertCustomStateMatchesSchema(input.stateSchema, input.defaultState, '默认自定义状态')
  input.abilities.forEach((ability, index) => {
    compileCustomStateSchema(ability.configSchema)
    compileCustomStateSchema(ability.inputSchema)
    compileCustomStateSchema(ability.resultSchema)
    assertCustomStateMatchesSchema(
      input.stateSchema,
      { ...input.defaultState, ...ability.runtime.statePatch },
      `abilities.${index}.runtime.statePatch`,
    )
  })
  input.declarativeMods.forEach((mod, index) => {
    compileCustomStateSchema(mod.configSchema)
    assertValueMatchesSchema(mod.configSchema, mod.defaultConfig, `declarativeMods.${index}.defaultConfig`)
  })
}

export function createStoryDraft(input: StoryDraftInput, database: Database = db) {
  const normalizedInput = remapNewStoryInput(input)
  const storyId = newId()
  const timestamp = nowIso()
  validateDynamicState(normalizedInput)
  database.transaction(() => {
    database
      .query(`
      INSERT INTO story_cards (
        id, title, cover, summary, description, background, world_rules,
        content_warnings_json, content_boundaries_json, tags_json,
        state_schema_json, default_state_json, state_policy_json,
        facts_json, lorebook_entries_json, nodes_json, declarative_mods_json,
        version, status, is_builtin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'draft', 0, ?, ?)
    `)
      .run(
        storyId,
        normalizedInput.title,
        normalizedInput.cover || '/covers/rain-terminal.png',
        normalizedInput.summary,
        normalizedInput.description,
        normalizedInput.background,
        normalizedInput.worldRules,
        JSON.stringify(normalizedInput.contentWarnings),
        JSON.stringify(normalizedInput.contentBoundaries),
        JSON.stringify(normalizedInput.tags),
        JSON.stringify(normalizedInput.stateSchema),
        JSON.stringify(normalizedInput.defaultState),
        JSON.stringify(normalizedInput.statePolicy),
        JSON.stringify(normalizedInput.facts),
        JSON.stringify(normalizedInput.lorebookEntries),
        JSON.stringify(normalizedInput.nodes),
        JSON.stringify(normalizedInput.declarativeMods),
        timestamp,
        timestamp,
      )
    writeStoryChildren(storyId, normalizedInput, preservedInputIds(normalizedInput), database)
  })()
  return getStory(storyId, true, database)!
}

function remapNewStoryInput(input: StoryDraftInput): StoryDraftInput {
  const characterMap = new Map(
    input.characters.filter((character) => character.id).map((character) => [character.id, newId()]),
  )
  const abilityMap = new Map(input.abilities.filter((ability) => ability.id).map((ability) => [ability.id, newId()]))
  const sceneMap = new Map(input.scenes.filter((scene) => scene.id).map((scene) => [scene.id, newId()]))
  return {
    ...input,
    characters: input.characters.map((character) => ({ ...character, id: characterMap.get(character.id) || newId() })),
    abilities: input.abilities.map((ability) => ({ ...ability, id: abilityMap.get(ability.id) || newId() })),
    facts: input.facts.map((fact) => ({
      ...fact,
      id: newId(),
      knownByCharacterIds: fact.knownByCharacterIds.map((id) => characterMap.get(id) || id),
    })),
    lorebookEntries: input.lorebookEntries.map((entry) => ({
      ...entry,
      id: newId(),
      characterIds: entry.characterIds.map((id) => characterMap.get(id) || id),
      sceneIds: entry.sceneIds.map((id) => sceneMap.get(id) || id),
    })),
    nodes: input.nodes.map((node) => ({ ...node, id: newId() })),
    declarativeMods: input.declarativeMods.map((mod) => ({ ...mod, id: newId() })),
    scenes: input.scenes.map((scene) => ({
      ...scene,
      id: sceneMap.get(scene.id) || newId(),
      participantIds: scene.participantIds.map((id) => characterMap.get(id) || id),
      openingCharacterId: scene.openingCharacterId ? characterMap.get(scene.openingCharacterId) || null : null,
    })),
    playerTemplate: { ...input.playerTemplate, id: newId() },
  }
}

function preservedInputIds(input: StoryDraftInput): PreservedStoryIds {
  return {
    characters: new Set(input.characters.map((item) => String(item.id))),
    abilities: new Set(input.abilities.map((item) => String(item.id))),
    scenes: new Set(input.scenes.map((item) => String(item.id))),
    playerTemplate: new Set(input.playerTemplate.id ? [String(input.playerTemplate.id)] : []),
  }
}

function preservedStoryIds(storyId: string, database: Database): PreservedStoryIds {
  const ids = (table: string) =>
    new Set(
      (database.query(`SELECT id FROM ${table} WHERE story_card_id = ?`).all(storyId) as Array<{ id: string }>).map(
        (row) => row.id,
      ),
    )
  return {
    characters: ids('characters'),
    abilities: ids('abilities'),
    scenes: ids('scenes'),
    playerTemplate: ids('player_templates'),
  }
}

export function updateStoryDraft(storyId: string, input: StoryDraftInput, database: Database = db) {
  const current = getStory(storyId, true, database)
  if (!current) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
  if (current.isBuiltin) throw new AppError(409, 'BUILTIN_STORY_READ_ONLY', '内置故事卡不能编辑，请先复制')
  if (input.version !== current.version) {
    throw new AppError(409, 'STORY_VERSION_CONFLICT', '故事卡已经在其他页面更新，请刷新后重试')
  }
  validateDynamicState(input)
  const issues = lintStoryDraft(input)
  const nextStatus = issues.some((issue) => issue.severity === 'error') ? 'draft' : String(current.status)
  const nextVersion = Number(current.version) + 1
  database.transaction(() => {
    const preserved = preservedStoryIds(storyId, database)
    database
      .query(`
      UPDATE story_cards SET title = ?, cover = ?, summary = ?, description = ?, background = ?,
        world_rules = ?, content_warnings_json = ?, content_boundaries_json = ?, tags_json = ?,
        state_schema_json = ?, default_state_json = ?, state_policy_json = ?,
        facts_json = ?, lorebook_entries_json = ?, nodes_json = ?, declarative_mods_json = ?,
        version = ?, status = ?, updated_at = ? WHERE id = ?
    `)
      .run(
        input.title,
        input.cover || '/covers/rain-terminal.png',
        input.summary,
        input.description,
        input.background,
        input.worldRules,
        JSON.stringify(input.contentWarnings),
        JSON.stringify(input.contentBoundaries),
        JSON.stringify(input.tags),
        JSON.stringify(input.stateSchema),
        JSON.stringify(input.defaultState),
        JSON.stringify(input.statePolicy),
        JSON.stringify(input.facts),
        JSON.stringify(input.lorebookEntries),
        JSON.stringify(input.nodes),
        JSON.stringify(input.declarativeMods),
        nextVersion,
        nextStatus,
        nowIso(),
        storyId,
      )
    database.query('DELETE FROM scenes WHERE story_card_id = ?').run(storyId)
    database.query('DELETE FROM abilities WHERE story_card_id = ?').run(storyId)
    database.query('DELETE FROM player_templates WHERE story_card_id = ?').run(storyId)
    database.query('DELETE FROM characters WHERE story_card_id = ?').run(storyId)
    writeStoryChildren(storyId, input, preserved, database)
  })()
  return getStory(storyId, true, database)!
}
