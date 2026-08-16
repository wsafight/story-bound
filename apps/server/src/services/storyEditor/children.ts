import type { Database } from 'bun:sqlite'
import { defaultCustomStateSchema } from '@storybound/shared/schemas'
import { db, newId } from '../../db/connection'
import type { StoryDraftInput } from '../../domain/schemas'
import { assertCustomStateMatchesSchema } from '../dynamicStateSchema'

export interface PreservedStoryIds {
  characters: Set<string>
  abilities: Set<string>
  scenes: Set<string>
  playerTemplate: Set<string>
}

export const noPreservedIds: PreservedStoryIds = {
  characters: new Set(),
  abilities: new Set(),
  scenes: new Set(),
  playerTemplate: new Set(),
}

export function writeStoryChildren(
  storyId: string,
  input: StoryDraftInput,
  preserved: PreservedStoryIds = noPreservedIds,
  database: Database = db,
) {
  const characterIds = new Map<string, string>()
  input.characters.forEach((character, index) => {
    const id = character.id && preserved.characters.has(character.id) ? character.id : newId()
    if (character.id) characterIds.set(character.id, id)
    database
      .query(`
      INSERT INTO characters (
        id, story_card_id, name, role_type, identity_text, appearance, personality,
        speech_style, goals, knowledge_scope, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        id,
        storyId,
        character.name,
        character.roleType,
        character.identity,
        character.appearance,
        character.personality,
        character.speechStyle,
        character.goals,
        character.knowledgeScope,
        index,
      )
  })
  const player = input.playerTemplate
  database
    .query(`
    INSERT INTO player_templates (id, story_card_id, role_name, background, goals, default_values_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .run(
      player.id && preserved.playerTemplate.has(player.id) ? player.id : newId(),
      storyId,
      player.roleName,
      player.background,
      player.goals,
      JSON.stringify(player.defaultValues),
    )
  input.abilities.forEach((ability, index) => {
    const abilityId = ability.id && preserved.abilities.has(ability.id) ? ability.id : newId()
    database
      .query(`
      INSERT INTO abilities (
        id, story_card_id, name, category, description, prompt, enabled_by_default,
        config_schema_json, input_schema_json, result_schema_json, runtime_json, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        abilityId,
        storyId,
        ability.name,
        ability.category,
        ability.description,
        ability.prompt,
        ability.enabledByDefault ? 1 : 0,
        JSON.stringify(ability.configSchema || defaultCustomStateSchema),
        JSON.stringify(ability.inputSchema || defaultCustomStateSchema),
        JSON.stringify(ability.resultSchema || defaultCustomStateSchema),
        JSON.stringify(ability.runtime || { usesPerConversation: null, cooldownTurns: 0, statePatch: {} }),
        index,
      )
  })
  input.scenes.forEach((scene, index) => {
    const sceneId = scene.id && preserved.scenes.has(scene.id) ? scene.id : newId()
    const participantIds = scene.participantIds.map((id) => characterIds.get(id) || id)
    const openingCharacterId = scene.openingCharacterId ? characterIds.get(scene.openingCharacterId) || null : null
    const custom = {
      ...input.defaultState,
      ...(scene.initialState.custom || {}),
    }
    assertCustomStateMatchesSchema(input.stateSchema, custom, `开场“${scene.title || index + 1}”自定义状态`)
    const initialState = {
      ...scene.initialState,
      phase: scene.initialState.phase || '故事开始',
      scene: {
        ...scene.initialState.scene,
        location: scene.location,
        time: scene.time,
        participantIds,
      },
      custom,
    }
    database
      .query(`
      INSERT INTO scenes (
        id, story_card_id, title, description, location, time_label, participant_ids_json,
        entry_method, opening_message, opening_sender, opening_character_id,
        initial_state_json, is_default, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        sceneId,
        storyId,
        scene.title,
        scene.description,
        scene.location,
        scene.time,
        JSON.stringify(participantIds),
        scene.entryMethod,
        scene.openingMessage,
        scene.openingSender,
        openingCharacterId,
        JSON.stringify(initialState),
        scene.isDefault ? 1 : 0,
        index,
      )
  })
}
