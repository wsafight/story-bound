import type { StoryDraftInput } from '../../domain/schemas'
import {
  assertCustomStateMatchesSchema,
  assertValueMatchesSchema,
  compileCustomStateSchema,
} from '../dynamicStateSchema'

export interface StoryLintIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

export function lintStoryDraft(input: StoryDraftInput): StoryLintIssue[] {
  const issues: StoryLintIssue[] = []
  const error = (path: string, message: string) => issues.push({ severity: 'error' as const, path, message })
  const warning = (path: string, message: string) => issues.push({ severity: 'warning' as const, path, message })
  if (!input.summary) error('summary', '需要一句能说明故事吸引力的简介')
  if (!input.background) error('background', '需要填写故事背景')
  if (!input.worldRules) error('worldRules', '需要填写世界规则或叙事约束')
  if (input.characters.length === 0) error('characters', '至少需要一个人物')
  input.characters.forEach((character, index) => {
    if (!character.name) error(`characters.${index}.name`, '人物需要名字')
    if (!character.identity) error(`characters.${index}.identity`, '人物需要身份说明')
  })
  if (!input.playerTemplate.roleName) error('playerTemplate.roleName', '需要设置玩家在故事中的身份')
  if (!input.playerTemplate.background) error('playerTemplate.background', '需要说明玩家背景')
  if (!input.playerTemplate.goals) error('playerTemplate.goals', '需要设置玩家目标')
  if (input.scenes.length === 0) error('scenes', '至少需要一个开场')
  if (input.scenes.length > 0 && input.scenes.filter((scene) => scene.isDefault).length !== 1) {
    error('scenes', '必须且只能有一个默认开场')
  }
  const characterIds = new Set(input.characters.map((character) => character.id).filter(Boolean))
  const sceneIds = new Set(input.scenes.map((scene) => scene.id).filter(Boolean))
  input.scenes.forEach((scene, index) => {
    if (!scene.title) error(`scenes.${index}.title`, '开场需要标题')
    if (!scene.location) error(`scenes.${index}.location`, '开场需要地点')
    if (!scene.openingMessage) error(`scenes.${index}.openingMessage`, '开场需要第一段故事文本')
    for (const participantId of scene.participantIds) {
      if (!characterIds.has(participantId)) error(`scenes.${index}.participantIds`, '开场引用了不存在的人物')
    }
    if (scene.openingSender === 'character') {
      if (!scene.openingCharacterId || !characterIds.has(scene.openingCharacterId)) {
        error(`scenes.${index}.openingCharacterId`, '人物开场需要选择有效的发言人')
      } else if (!scene.participantIds.includes(scene.openingCharacterId)) {
        error(`scenes.${index}.participantIds`, '开场发言人必须同时在场')
      }
    }
  })
  input.abilities.forEach((ability, index) => {
    if (!ability.name) error(`abilities.${index}.name`, '能力需要名字')
    if (!ability.prompt) warning(`abilities.${index}.prompt`, '没有模型提示的能力只会作为标签出现')
  })
  input.facts.forEach((fact, index) => {
    if (!fact.title) error(`facts.${index}.title`, '事实需要标题')
    if (!fact.content) error(`facts.${index}.content`, '事实需要内容')
    for (const characterId of fact.knownByCharacterIds) {
      if (!characterIds.has(characterId)) error(`facts.${index}.knownByCharacterIds`, '事实引用了不存在的人物')
    }
    if (fact.visibility === 'secret' && fact.knownByCharacterIds.length === 0) {
      warning(`facts.${index}.knownByCharacterIds`, '秘密事实建议标记至少一个知情人物')
    }
  })
  const factTitles = new Set(input.facts.map((fact) => fact.title).filter(Boolean))
  input.lorebookEntries.forEach((entry, index) => {
    if (!entry.title) error(`lorebookEntries.${index}.title`, '世界书资料需要标题')
    if (!entry.content) error(`lorebookEntries.${index}.content`, '世界书资料需要内容')
    if (entry.keywords.length === 0)
      warning(`lorebookEntries.${index}.keywords`, '没有关键词的世界书资料会只按条件召回')
    if (entry.scope === 'scene') {
      if (entry.sceneIds.length === 0) warning(`lorebookEntries.${index}.sceneIds`, '场景作用域建议选择至少一个场景')
      for (const sceneId of entry.sceneIds) {
        if (!sceneIds.has(sceneId)) error(`lorebookEntries.${index}.sceneIds`, '世界书资料引用了不存在的场景')
      }
    }
    if (entry.scope === 'character') {
      if (entry.characterIds.length === 0) {
        warning(`lorebookEntries.${index}.characterIds`, '人物作用域建议选择至少一个人物')
      }
      for (const characterId of entry.characterIds) {
        if (!characterIds.has(characterId))
          error(`lorebookEntries.${index}.characterIds`, '世界书资料引用了不存在的人物')
      }
    }
    if (entry.scope === 'chapter' && entry.chapterNumbers.length === 0) {
      warning(`lorebookEntries.${index}.chapterNumbers`, '章节作用域建议填写至少一个章节序号')
    }
    if (entry.title && factTitles.has(entry.title)) {
      warning(`lorebookEntries.${index}.title`, '世界书资料与事实同名；确认它只是背景召回，不是已确认事实')
    }
  })
  input.nodes.forEach((node, index) => {
    if (!node.title) error(`nodes.${index}.title`, '故事节点需要标题')
    if (!node.prompt) warning(`nodes.${index}.prompt`, '没有提示词的节点不会引导模型')
    const conditionKeys = Object.keys(node.condition || {})
    const unsupported = conditionKeys.filter(
      (key) => !['all', 'any', 'not', 'phase', 'location', 'time', 'custom'].includes(key),
    )
    if (unsupported.length > 0) {
      warning(`nodes.${index}.condition`, `节点条件包含暂未执行的字段：${unsupported.join('、')}`)
    }
  })
  input.declarativeMods.forEach((mod, index) => {
    if (!mod.name) error(`declarativeMods.${index}.name`, '声明式 MOD 需要名称')
    if (!mod.version) error(`declarativeMods.${index}.version`, '声明式 MOD 需要版本')
    if (!mod.prompt) warning(`declarativeMods.${index}.prompt`, '没有提示词贡献的声明式 MOD 不会影响生成')
  })
  if (!input.cover) warning('cover', '没有设置封面，将使用默认故事封面')
  if (input.contentBoundaries.length === 0) warning('contentBoundaries', '建议明确模型需要避开或淡化的内容')
  try {
    compileCustomStateSchema(input.stateSchema)
    assertCustomStateMatchesSchema(input.stateSchema, input.defaultState, '默认自定义状态')
    input.scenes.forEach((scene, index) => {
      assertCustomStateMatchesSchema(
        input.stateSchema,
        { ...input.defaultState, ...(scene.initialState.custom || {}) },
        `scenes.${index}.initialState.custom`,
      )
    })
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
  } catch (reason) {
    error('stateSchema', reason instanceof Error ? reason.message : '动态状态 Schema 不正确')
  }
  return issues
}
