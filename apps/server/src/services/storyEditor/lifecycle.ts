import type { Database } from 'bun:sqlite'
import { db, newId, nowIso } from '../../db/connection'
import type { StoryDraftInput } from '../../domain/schemas'
import { getStory } from '../../repositories/stories'
import { AppError } from '../../shared/errors'
import { createStoryDraft } from './drafts'
import { lintStoryDraft } from './lint'

function editableInput(story: NonNullable<ReturnType<typeof getStory>>): StoryDraftInput {
  return {
    version: Number(story.version),
    title: String(story.title),
    cover: String(story.cover || ''),
    summary: String(story.summary),
    description: String(story.description),
    background: String(story.background),
    worldRules: String(story.worldRules),
    contentWarnings: story.contentWarnings as string[],
    contentBoundaries: story.contentBoundaries as string[],
    tags: story.tags as string[],
    stateSchema: story.stateSchema as StoryDraftInput['stateSchema'],
    defaultState: story.defaultState as StoryDraftInput['defaultState'],
    statePolicy: story.statePolicy as StoryDraftInput['statePolicy'],
    characters: story.characters as StoryDraftInput['characters'],
    abilities: story.abilities as StoryDraftInput['abilities'],
    facts: story.facts as StoryDraftInput['facts'],
    lorebookEntries: story.lorebookEntries as StoryDraftInput['lorebookEntries'],
    nodes: story.nodes as StoryDraftInput['nodes'],
    declarativeMods: story.declarativeMods as StoryDraftInput['declarativeMods'],
    scenes: story.scenes as StoryDraftInput['scenes'],
    playerTemplate: story.playerTemplate as StoryDraftInput['playerTemplate'],
  }
}

export function publishStory(storyId: string, database: Database = db) {
  const story = getStory(storyId, true, database)
  if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
  if (story.isBuiltin) throw new AppError(409, 'BUILTIN_STORY_READ_ONLY', '内置故事卡已经发布且不可编辑')
  const issues = lintStoryDraft(editableInput(story))
  if (issues.some((issue) => issue.severity === 'error')) {
    throw new AppError(422, 'STORY_CARD_INVALID', '故事卡体检未通过', { issues })
  }
  database.query("UPDATE story_cards SET status = 'active', updated_at = ? WHERE id = ?").run(nowIso(), storyId)
  return { story: getStory(storyId, true, database)!, issues }
}

export function deleteStoryDraft(storyId: string, database: Database = db) {
  const story = getStory(storyId, true, database)
  if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
  if (story.isBuiltin) throw new AppError(409, 'BUILTIN_STORY_READ_ONLY', '内置故事卡不能删除')
  if (story.status !== 'draft') throw new AppError(409, 'STORY_NOT_DRAFT', '只有草稿可以删除')
  if (story.conversationCount > 0) throw new AppError(409, 'STORY_HAS_CONVERSATIONS', '这个故事已有存档，不能删除草稿')
  const result = database
    .query("UPDATE story_cards SET status = 'trashed', updated_at = ? WHERE id = ? AND status = 'draft'")
    .run(nowIso(), storyId)
  if (result.changes !== 1) throw new AppError(409, 'STORY_CHANGED', '草稿状态已经变化，请刷新后重试')
}

export function duplicateStory(storyId: string, database: Database = db) {
  const source = getStory(storyId, true, database)
  if (!source) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
  const input = editableInput(source)
  const characterMap = new Map(input.characters.map((character) => [character.id, newId()]))
  input.characters = input.characters.map((character) => ({ ...character, id: characterMap.get(character.id) }))
  input.abilities = input.abilities.map((ability) => ({ ...ability, id: newId() }))
  input.facts = input.facts.map((fact) => ({
    ...fact,
    id: newId(),
    knownByCharacterIds: fact.knownByCharacterIds.map((id) => characterMap.get(id) || id),
  }))
  const sceneMap = new Map(input.scenes.map((scene) => [scene.id, newId()]))
  input.lorebookEntries = input.lorebookEntries.map((entry) => ({
    ...entry,
    id: newId(),
    characterIds: entry.characterIds.map((id) => characterMap.get(id) || id),
    sceneIds: entry.sceneIds.map((id) => sceneMap.get(id) || id),
  }))
  input.nodes = input.nodes.map((node) => ({ ...node, id: newId() }))
  input.declarativeMods = input.declarativeMods.map((mod) => ({ ...mod, id: newId() }))
  input.scenes = input.scenes.map((scene) => ({
    ...scene,
    id: sceneMap.get(scene.id) || newId(),
    participantIds: scene.participantIds.map((id) => characterMap.get(id) || id),
    openingCharacterId: scene.openingCharacterId ? characterMap.get(scene.openingCharacterId) || null : null,
  }))
  input.playerTemplate = { ...input.playerTemplate, id: newId() }
  input.title = `${source.title} 副本`
  delete input.version
  return createStoryDraft(input, database)
}
