import { createHash } from 'node:crypto'
import { defaultPromptTextProfile, stablePromptTextHash } from './profile'
import type { PromptBlockScope, PromptBlockSource, PromptPriority } from './types'

export interface PromptBlockDefinition {
  id: string
  title: string
  source: PromptBlockSource
  scope: PromptBlockScope
  priority: PromptPriority
  budgetRatio: number | null
  sourceLabel: string
  scopeLabel: string
}

const sourceLabels: Record<PromptBlockSource, string> = {
  core: '应用内置',
  story: '故事卡快照',
  state: '运行时检查点',
  fact: '故事卡快照',
  lorebook: '故事卡快照',
  memory: '运行时状态',
  node: '故事卡快照',
  ability: '能力快照',
  director: '导演指令',
  mod: 'MOD',
  history: '消息路径',
  input: '玩家消息',
}

const scopeLabels: Record<PromptBlockScope, string> = {
  app: '全局',
  story: '故事',
  conversation: '存档',
  chapter: '章节',
  scene: '当前场景',
  turn: '当前轮次',
}

const blocks: PromptBlockDefinition[] = [
  {
    id: 'core.application-rules',
    title: '应用规则',
    source: 'core',
    scope: 'app',
    priority: 'required',
    budgetRatio: 0.05,
    sourceLabel: sourceLabels.core,
    scopeLabel: scopeLabels.app,
  },
  {
    id: 'story.world',
    title: '故事背景与世界规则',
    source: 'story',
    scope: 'story',
    priority: 'required',
    budgetRatio: 0.1,
    sourceLabel: sourceLabels.story,
    scopeLabel: scopeLabels.story,
  },
  {
    id: 'conversation.player',
    title: '玩家快照',
    source: 'state',
    scope: 'conversation',
    priority: 'required',
    budgetRatio: 0.05,
    sourceLabel: '对话快照',
    scopeLabel: scopeLabels.conversation,
  },
  {
    id: 'state.scene',
    title: '当前场景',
    source: 'state',
    scope: 'scene',
    priority: 'required',
    budgetRatio: 0.05,
    sourceLabel: sourceLabels.state,
    scopeLabel: scopeLabels.scene,
  },
  {
    id: 'state.story-dynamics',
    title: '动态故事状态',
    source: 'state',
    scope: 'conversation',
    priority: 'high',
    budgetRatio: 0.08,
    sourceLabel: sourceLabels.state,
    scopeLabel: scopeLabels.conversation,
  },
  {
    id: 'story.characters.active',
    title: '在场人物',
    source: 'story',
    scope: 'scene',
    priority: 'high',
    budgetRatio: 0.12,
    sourceLabel: sourceLabels.story,
    scopeLabel: scopeLabels.scene,
  },
  {
    id: 'story.facts.visible',
    title: '结构化事实',
    source: 'fact',
    scope: 'story',
    priority: 'high',
    budgetRatio: 0.08,
    sourceLabel: sourceLabels.fact,
    scopeLabel: '事实与知情范围',
  },
  {
    id: 'story.lorebook.matched',
    title: '世界书资料',
    source: 'lorebook',
    scope: 'turn',
    priority: 'medium',
    budgetRatio: 0.08,
    sourceLabel: sourceLabels.lorebook,
    scopeLabel: '关键词与条件召回',
  },
  {
    id: 'story.nodes.matched',
    title: '故事节点',
    source: 'node',
    scope: 'turn',
    priority: 'high',
    budgetRatio: 0.08,
    sourceLabel: sourceLabels.node,
    scopeLabel: '当前状态',
  },
  {
    id: 'conversation.abilities',
    title: '能力',
    source: 'ability',
    scope: 'conversation',
    priority: 'high',
    budgetRatio: 0.05,
    sourceLabel: sourceLabels.ability,
    scopeLabel: scopeLabels.conversation,
  },
  {
    id: 'state.memory',
    title: '章节回顾与固定记忆',
    source: 'memory',
    scope: 'conversation',
    priority: 'medium',
    budgetRatio: 0.1,
    sourceLabel: sourceLabels.memory,
    scopeLabel: '当前检查点',
  },
  {
    id: 'story.declarative-mods',
    title: '声明式 MOD',
    source: 'mod',
    scope: 'story',
    priority: 'medium',
    budgetRatio: 0.05,
    sourceLabel: sourceLabels.mod,
    scopeLabel: '存档默认启用',
  },
  {
    id: 'mod.runtime',
    title: '可信 MOD 与导演贡献',
    source: 'mod',
    scope: 'conversation',
    priority: 'medium',
    budgetRatio: 0.12,
    sourceLabel: sourceLabels.mod,
    scopeLabel: scopeLabels.conversation,
  },
  {
    id: 'history.path',
    title: '历史消息',
    source: 'history',
    scope: 'conversation',
    priority: 'medium',
    budgetRatio: null,
    sourceLabel: sourceLabels.history,
    scopeLabel: '当前分支',
  },
  {
    id: 'input.current',
    title: '本次玩家输入',
    source: 'input',
    scope: 'turn',
    priority: 'required',
    budgetRatio: null,
    sourceLabel: sourceLabels.input,
    scopeLabel: scopeLabels.turn,
  },
]

const blockMap = new Map(blocks.map((block) => [block.id, block]))

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function getPromptBlockDefinition(id: string) {
  return blockMap.get(id)
}

export function promptBudgetRatio(id: string, fallback: number) {
  return blockMap.get(id)?.budgetRatio ?? fallback
}

export function promptSourceLabel(source: PromptBlockSource) {
  return sourceLabels[source]
}

export function promptScopeLabel(scope: PromptBlockScope) {
  return scopeLabels[scope]
}

export function getPromptProfileSnapshot() {
  const profile = {
    id: defaultPromptTextProfile.id,
    version: defaultPromptTextProfile.version,
    locale: defaultPromptTextProfile.locale,
    textHash: stablePromptTextHash(defaultPromptTextProfile),
    style: defaultPromptTextProfile.narrativeStyle,
    blockOrder: blocks.map((block) => block.id),
    blocks,
  }
  return { ...profile, hash: stableHash(profile) }
}
