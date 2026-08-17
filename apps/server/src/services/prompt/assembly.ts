import { db } from '../../db/connection'
import { resolveModelLimits } from '../../llm/modelLimits'
import { getConversationRow, parseJson } from '../../repositories/conversations'
import type { PromptAssembly, PromptContribution } from '../../runtime/storyboundRuntime'
import { AppError } from '../../shared/errors'
import {
  clipHistoryContent,
  formatLongTermMemoryForPrompt,
  longTermMemoriesForPrompt,
  shortTermHistoryMessageLimit,
} from '../conversationManagement/longTermMemory'
import { storyConditionMatches } from '../storyConditions'
import { applyPromptContributions, assertSegmentBudget, includeRecords, quota } from './budget'
import { assembleSystemPrompt, createPromptBlock, createPromptSnapshot, promptBlockToSegment } from './compiler'
import { estimateTokens, getStaticContext } from './contextCache'
import { collectDynamicStateRecords, nodeProgressStatus } from './dynamics'
import { ancestorBatch } from './history'
import { collectLorebookEntries, renderLorebookEntry } from './lorebook'
import { promptBudgetRatio } from './registry'
import type { ChatMessage, ContextEstimate, Row } from './types'

export function buildBaseModelMessages(
  conversationId: string,
  playerMessageId: string,
  contributions: PromptContribution[],
): PromptAssembly {
  const conversation = getConversationRow(conversationId)
  if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
  const staticContext = getStaticContext(conversationId, conversation)
  const { story, model, application, world, playerText } = staticContext
  const scene = parseJson<Record<string, any>>(conversation.scene_snapshot_json, {})
  const characters = Array.isArray(story.characters) ? story.characters : []
  const { contextWindow, outputReserved } = resolveModelLimits(model.contextWindow, model.maxOutputTokens)
  const rawInputBudget = contextWindow - outputReserved
  const envelopeReserved = Math.max(64, Math.ceil(rawInputBudget * 0.05))
  const requestBudget = rawInputBudget - envelopeReserved
  const blockBudget = (id: string, fallback: number) => quota(rawInputBudget, promptBudgetRatio(id, fallback))
  const budgets = {
    application: blockBudget('core.application-rules', 0.05),
    world: blockBudget('story.world', 0.1),
    player: blockBudget('conversation.player', 0.05),
    scene: blockBudget('state.scene', 0.05),
    dynamics: blockBudget('state.story-dynamics', 0.08),
    characters: blockBudget('story.characters.active', 0.12),
    facts: blockBudget('story.facts.visible', 0.08),
    lorebook: blockBudget('story.lorebook.matched', 0.08),
    nodes: blockBudget('story.nodes.matched', 0.08),
    abilities: blockBudget('conversation.abilities', 0.05),
    memory: blockBudget('state.memory', 0.1),
    declarativeMods: blockBudget('story.declarative-mods', 0.05),
    mods: blockBudget('mod.runtime', 0.12),
  }
  const contributionResult = applyPromptContributions(contributions, budgets.mods)

  const current = db
    .query('SELECT * FROM messages WHERE id = ? AND conversation_id = ?')
    .get(playerMessageId, conversationId) as Row | null
  if (!current || current.sender !== 'player')
    throw new AppError(409, 'PLAYER_MESSAGE_REQUIRED', '生成基线必须以玩家消息结束')
  const checkpoint = db
    .query('SELECT state_json, ability_snapshot_json FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
    .get(String(current.runtime_checkpoint_id), conversationId) as Row | null
  if (!checkpoint) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法恢复玩家消息对应的故事状态')
  const abilities = parseJson<Array<Record<string, any>>>(checkpoint.ability_snapshot_json, [])
  const state = parseJson<Record<string, any>>(checkpoint.state_json, {})
  const modeLabels = { dialogue: '对话', action: '行动', narration: '旁白' } as const
  const inputMode = String(current.input_mode) as keyof typeof modeLabels
  const currentInput = `[玩家${modeLabels[inputMode] || '输入'}]\n${String(current.content)}`
  const currentChapter = conversation.current_chapter_id
    ? (db
        .query('SELECT number FROM chapters WHERE id = ? AND conversation_id = ?')
        .get(String(conversation.current_chapter_id), conversationId) as Row | null)
    : null

  const sceneText = `当前场景：${scene.title || ''}；地点：${state?.scene?.location || scene.location || ''}；时间：${state?.scene?.time || scene.time || ''}；阶段：${state.phase || ''}`

  assertSegmentBudget('应用规则', application, budgets.application)
  assertSegmentBudget('故事背景与世界规则', world, budgets.world)
  assertSegmentBudget('玩家快照', playerText, budgets.player)
  assertSegmentBudget('当前场景', sceneText, budgets.scene)

  const participantIds = new Set<string>(state?.scene?.participantIds || scene.participantIds || [])
  let activeCharacters = characters.filter((character: any) => participantIds.has(String(character.id)))
  if (activeCharacters.length === 0) {
    const main = characters.find((character: any) => character.roleType === 'main')
    if (main) activeCharacters = [main]
  }
  const characterResult = includeRecords(
    activeCharacters,
    (character: any) =>
      `${character.name}（${character.identity}）：性格 ${character.personality}；说话方式 ${character.speechStyle}；目标 ${character.goals}；认知边界 ${character.knowledgeScope}`,
    budgets.characters,
    true,
  )
  const abilityResult = includeRecords(
    abilities,
    (ability) => `${ability.name}：${ability.description}。${ability.prompt}`,
    budgets.abilities,
  )
  const characterText = characterResult.text ? `当前在场人物：\n${characterResult.text}` : '当前没有明确的在场人物。'
  const activeCharacterIds = new Set(activeCharacters.map((character: any) => String(character.id)))
  const facts = Array.isArray(story.facts) ? story.facts : []
  const factResult = includeRecords(
    facts.filter((fact: any) => {
      if (fact.visibility !== 'secret') return true
      return Array.isArray(fact.knownByCharacterIds)
        ? fact.knownByCharacterIds.some((id: unknown) => activeCharacterIds.has(String(id)))
        : false
    }),
    (fact: any) =>
      `${fact.visibility === 'secret' ? '秘密事实' : '公开事实'}：${fact.title}。${fact.content}${
        fact.visibility === 'secret' ? '（只能让知情人物按此行动，不要无故向玩家揭露。）' : ''
      }`,
    budgets.facts,
  )
  const factText = factResult.text ? `结构化事实：\n${factResult.text}` : ''
  const lorebookEntries = Array.isArray(story.lorebookEntries) ? story.lorebookEntries : []
  const matchedLorebookEntries = collectLorebookEntries({
    entries: lorebookEntries,
    state,
    scene,
    activeCharacters,
    currentInput,
    currentChapterNumber: currentChapter ? Number(currentChapter.number) : null,
  })
  const lorebookResult = includeRecords(matchedLorebookEntries, renderLorebookEntry, budgets.lorebook)
  const lorebookText = lorebookResult.text ? `召回的世界书资料：\n${lorebookResult.text}` : ''
  const nodes = Array.isArray(story.nodes) ? story.nodes : []
  const dynamicStateResult = includeRecords(
    collectDynamicStateRecords({ story, state, abilities, nodes }),
    (record) => record,
    budgets.dynamics,
  )
  const dynamicStateText = dynamicStateResult.text ? `动态故事状态：\n${dynamicStateResult.text}` : ''
  const matchedNodes = nodes.filter((node: any) => {
    const status = nodeProgressStatus(state, String(node.id))
    return (
      node.enabled !== false &&
      status !== 'completed' &&
      status !== 'skipped' &&
      storyConditionMatches(node.condition, state)
    )
  })
  const nodeResult = includeRecords(
    matchedNodes,
    (node: any) => {
      const status = nodeProgressStatus(state, String(node.id)) === 'active' ? '进行中' : '可触发'
      return `${status}：${node.title}。${node.description}。引导：${node.prompt}`
    },
    budgets.nodes,
  )
  const nodeText = nodeResult.text ? `当前可触发故事节点：\n${nodeResult.text}` : ''
  const declarativeMods = Array.isArray(story.declarativeMods) ? story.declarativeMods : []
  const declarativeModResult = includeRecords(
    declarativeMods.filter((mod: any) => mod.enabledByDefault !== false),
    (mod: any) => `${mod.name}@${mod.version}：${mod.prompt}`,
    budgets.declarativeMods,
  )
  const declarativeModText = declarativeModResult.text ? `声明式 MOD 提示词贡献：\n${declarativeModResult.text}` : ''
  const abilityText = abilityResult.text ? `玩家启用能力：\n${abilityResult.text}` : '玩家未启用额外能力。'
  const custom = state.custom && typeof state.custom === 'object' ? state.custom : {}
  const longTermMemories = longTermMemoriesForPrompt(state)
  const pinnedMemories = Array.isArray(custom.pinnedMemories) ? custom.pinnedMemories : []
  const chapterSummaries = Array.isArray(custom.chapterSummaries) ? custom.chapterSummaries : []
  const memoryResult = includeRecords(
    [...longTermMemories]
      .reverse()
      .map((item) => ({ ...item, memoryType: 'long_term' }))
      .concat([...pinnedMemories].reverse(), [...chapterSummaries].reverse()),
    (item: any) => {
      if (typeof item === 'string') return item
      if (item.memoryType === 'long_term') return formatLongTermMemoryForPrompt(item)
      return `${item.title ? `${item.title}：` : ''}${item.summary || item.content || ''}`
    },
    budgets.memory,
  )
  const memoryText = memoryResult.text ? `已确认的长期记忆、章节回顾与固定记忆：\n${memoryResult.text}` : ''

  const checkpointId = String(current.runtime_checkpoint_id)
  const storyVersion = `story:${story.id || conversation.story_card_id || 'snapshot'}@${story.version || 0}`
  const systemBlocks = [
    createPromptBlock({
      id: 'core.application-rules',
      title: '应用规则',
      source: 'core',
      scope: 'app',
      priority: 'required',
      text: application,
      budget: budgets.application,
      dependencies: ['core:application-rules'],
    }),
    createPromptBlock({
      id: 'story.world',
      title: '故事背景与世界规则',
      source: 'story',
      scope: 'story',
      priority: 'required',
      text: world,
      budget: budgets.world,
      dependencies: [storyVersion],
    }),
    createPromptBlock({
      id: 'conversation.player',
      title: '玩家快照',
      source: 'state',
      scope: 'conversation',
      priority: 'required',
      text: playerText,
      budget: budgets.player,
      dependencies: [`conversation:${conversationId}:player-snapshot`],
    }),
    createPromptBlock({
      id: 'state.scene',
      title: '当前场景',
      source: 'state',
      scope: 'scene',
      priority: 'required',
      text: sceneText,
      budget: budgets.scene,
      dependencies: [checkpointId],
    }),
    createPromptBlock({
      id: 'state.story-dynamics',
      title: '动态故事状态',
      source: 'state',
      scope: 'conversation',
      priority: 'high',
      text: dynamicStateText,
      budget: budgets.dynamics,
      includedItems: dynamicStateResult.included,
      omittedItems: dynamicStateResult.omitted,
      reason: dynamicStateText ? (dynamicStateResult.omitted > 0 ? 'budget_exceeded' : undefined) : 'empty',
      dependencies: [storyVersion, checkpointId],
    }),
    createPromptBlock({
      id: 'story.characters.active',
      title: '在场人物',
      source: 'story',
      scope: 'scene',
      priority: 'high',
      text: characterText,
      budget: budgets.characters,
      includedItems: characterResult.included,
      omittedItems: characterResult.omitted,
      reason: characterResult.omitted > 0 ? 'budget_exceeded' : undefined,
      dependencies: [storyVersion, checkpointId],
    }),
    createPromptBlock({
      id: 'story.facts.visible',
      title: '结构化事实',
      source: 'fact',
      scope: 'story',
      priority: 'high',
      text: factText,
      budget: budgets.facts,
      includedItems: factResult.included,
      omittedItems: factResult.omitted,
      reason: factText ? (factResult.omitted > 0 ? 'budget_exceeded' : undefined) : 'condition_not_matched',
      dependencies: [storyVersion, checkpointId],
    }),
    createPromptBlock({
      id: 'story.lorebook.matched',
      title: '世界书资料',
      source: 'lorebook',
      scope: 'turn',
      priority: 'medium',
      text: lorebookText,
      budget: budgets.lorebook,
      includedItems: lorebookResult.included,
      omittedItems: lorebookResult.omitted,
      reason: lorebookText ? (lorebookResult.omitted > 0 ? 'budget_exceeded' : undefined) : 'condition_not_matched',
      dependencies: [storyVersion, checkpointId, ...matchedLorebookEntries.map((entry: any) => `lorebook:${entry.id}`)],
    }),
    createPromptBlock({
      id: 'story.nodes.matched',
      title: '故事节点',
      source: 'node',
      scope: 'turn',
      priority: 'high',
      text: nodeText,
      budget: budgets.nodes,
      includedItems: nodeResult.included,
      omittedItems: nodeResult.omitted,
      reason: nodeText ? (nodeResult.omitted > 0 ? 'budget_exceeded' : undefined) : 'condition_not_matched',
      dependencies: [storyVersion, checkpointId, ...matchedNodes.map((node: any) => `node:${String(node.id)}`)],
    }),
    createPromptBlock({
      id: 'conversation.abilities',
      title: '能力',
      source: 'ability',
      scope: 'conversation',
      priority: 'high',
      text: abilityText,
      budget: budgets.abilities,
      includedItems: abilityResult.included,
      omittedItems: abilityResult.omitted,
      reason: abilityResult.omitted > 0 ? 'budget_exceeded' : undefined,
      dependencies: [`conversation:${conversationId}:abilities`, checkpointId],
    }),
    createPromptBlock({
      id: 'state.memory',
      title: '长期记忆、章节回顾与固定记忆',
      source: 'memory',
      scope: 'conversation',
      priority: 'medium',
      text: memoryText,
      budget: budgets.memory,
      includedItems: memoryResult.included,
      omittedItems: memoryResult.omitted,
      reason: memoryText ? (memoryResult.omitted > 0 ? 'budget_exceeded' : undefined) : 'empty',
      dependencies: [checkpointId],
    }),
    createPromptBlock({
      id: 'story.declarative-mods',
      title: '声明式 MOD',
      source: 'mod',
      scope: 'story',
      priority: 'medium',
      text: declarativeModText,
      budget: budgets.declarativeMods,
      includedItems: declarativeModResult.included,
      omittedItems: declarativeModResult.omitted,
      reason: declarativeModText ? (declarativeModResult.omitted > 0 ? 'budget_exceeded' : undefined) : 'disabled',
      dependencies: [storyVersion],
    }),
    ...contributionResult.results.map((item) =>
      createPromptBlock({
        id: `mod.${item.modId}.${item.id}`,
        title: `MOD · ${item.label}`,
        source: item.section === 'director' ? 'director' : 'mod',
        scope: 'conversation',
        priority: item.required ? 'required' : item.priority >= 70 ? 'high' : item.priority >= 40 ? 'medium' : 'low',
        text: item.included ? `[MOD · ${item.label}]\n${item.content}` : '',
        budget: budgets.mods,
        included: item.included,
        reason: item.reason,
        dependencies: [`mod:${item.modId}`, checkpointId],
      }),
    ),
  ]
  const system = assembleSystemPrompt(systemBlocks)
  const fixedTokens = systemBlocks
    .filter((block) => block.included)
    .reduce((total, block) => total + block.tokenEstimate, 0)
  const inputTokens = estimateTokens(currentInput) + 4
  if (fixedTokens + inputTokens > requestBudget) {
    throw new AppError(422, 'CONTEXT_BUDGET_EXCEEDED', '故事设定与本次玩家输入超过当前模型上下文', {
      segment: '本次玩家输入',
      estimatedTokens: fixedTokens + inputTokens,
      budget: requestBudget,
    })
  }

  const historyBudget = requestBudget - fixedTokens - inputTokens
  let historyTokens = 0
  const historyNewestFirst: ChatMessage[] = []
  const historyMessageIdsNewestFirst: string[] = []
  const totalHistoryMessages = Math.max(0, Number(current.tree_depth) || 0)
  if (
    (current.parent_message_id && totalHistoryMessages === 0) ||
    (!current.parent_message_id && totalHistoryMessages > 0)
  ) {
    throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法恢复当前消息路径')
  }
  const maxRawHistoryMessages = Math.min(totalHistoryMessages, shortTermHistoryMessageLimit)
  let remainingAncestors = maxRawHistoryMessages
  let ancestorId = current.parent_message_id ? String(current.parent_message_id) : ''
  let budgetFilled = false
  const batchSize = 256
  while (ancestorId && remainingAncestors > 0 && !budgetFilled) {
    const requestedBatchSize = Math.min(batchSize, remainingAncestors)
    const rows = ancestorBatch(conversationId, ancestorId, requestedBatchSize)
    if (rows.length === 0) throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法恢复当前消息路径')
    for (const row of rows) {
      const rawContent = clipHistoryContent(String(row.content), historyNewestFirst.length)
      const content =
        row.sender === 'player'
          ? `[玩家${modeLabels[String(row.input_mode) as keyof typeof modeLabels] || '输入'}]\n${rawContent}`
          : rawContent
      const tokens = estimateTokens(content) + 4
      if (historyTokens + tokens > historyBudget) {
        budgetFilled = true
        break
      }
      historyTokens += tokens
      historyNewestFirst.push({ role: row.sender === 'player' ? 'user' : 'assistant', content })
      historyMessageIdsNewestFirst.push(String(row.id))
      remainingAncestors -= 1
      ancestorId = row.parent_message_id ? String(row.parent_message_id) : ''
    }
    if (!budgetFilled && rows.length < requestedBatchSize) {
      if (remainingAncestors > 0) throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法恢复当前消息路径')
      break
    }
  }
  const history = historyNewestFirst.reverse()
  const historyMessageIds = historyMessageIdsNewestFirst.reverse()
  const omittedByShortTermWindow = Math.max(0, totalHistoryMessages - shortTermHistoryMessageLimit)
  const omittedByBudget = Math.max(0, maxRawHistoryMessages - history.length)
  const omittedMessages = Math.max(0, totalHistoryMessages - history.length)
  const historyBlock = createPromptBlock({
    id: 'history.path',
    title: '历史消息',
    source: 'history',
    scope: 'conversation',
    priority: 'medium',
    text: history.map((message) => message.content).join('\n\n'),
    tokenEstimate: historyTokens,
    budget: historyBudget,
    included: true,
    includedItems: history.length,
    omittedItems: omittedMessages,
    reason: omittedByBudget > 0 ? 'budget_exceeded' : omittedByShortTermWindow > 0 ? 'short_term_window' : undefined,
    dependencies: historyMessageIds,
  })
  const inputBlock = createPromptBlock({
    id: 'input.current',
    title: '本次玩家输入',
    source: 'input',
    scope: 'turn',
    priority: 'required',
    text: currentInput,
    tokenEstimate: inputTokens,
    budget: Math.max(0, requestBudget - fixedTokens),
    included: true,
    dependencies: [playerMessageId],
  })
  const promptBlocks = [...systemBlocks, historyBlock, inputBlock]
  const segments: ContextEstimate['segments'] = promptBlocks
    .filter((block) => block.included || block.reason !== 'empty')
    .map(promptBlockToSegment)
  const promptSnapshot = createPromptSnapshot({
    blocks: promptBlocks,
    finalSystem: system,
    historyMessageIds: [...historyMessageIds, playerMessageId],
    contextWindow,
    outputReserved,
    envelopeReserved,
    requestBudget,
  })
  const contextEstimate: ContextEstimate = {
    contextWindow,
    outputReserved,
    envelopeReserved,
    requestBudget,
    estimatedTokens: fixedTokens + inputTokens + historyTokens,
    segments,
    history: { includedMessages: history.length, omittedMessages, estimatedTokens: historyTokens },
    promptSnapshot,
  }

  return {
    system,
    messages: [...history, { role: 'user' as const, content: currentInput }],
    characterId: activeCharacters.length === 1 ? String(activeCharacters[0]?.id || '') || null : null,
    contextEstimate,
    contributions: contributionResult.results,
  }
}
