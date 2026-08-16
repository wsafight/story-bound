import { getPromptProfileSnapshot } from './registry'
import type { PromptSnapshot } from './types'

export type PromptGoldenScenario = {
  id: string
  title: string
  requiredBlockIds: string[]
  expectedIncludedBlockIds?: string[]
  expectedOrder: string[]
  assertions: string[]
}

export type PromptGoldenCheck = {
  id: string
  scenarioId: string
  title: string
  status: 'passed' | 'failed'
  message: string
}

const promptGoldenScenarios: PromptGoldenScenario[] = [
  {
    id: 'baseline-turn',
    title: '基础对话轮次',
    requiredBlockIds: [
      'core.application-rules',
      'story.world',
      'conversation.player',
      'state.scene',
      'history.path',
      'input.current',
    ],
    expectedIncludedBlockIds: [
      'core.application-rules',
      'story.world',
      'conversation.player',
      'state.scene',
      'history.path',
      'input.current',
    ],
    expectedOrder: ['core.application-rules', 'story.world', 'conversation.player', 'state.scene', 'input.current'],
    assertions: ['必需块必须 included', 'input.current 必须在最终顺序最后'],
  },
  {
    id: 'dynamic-state-turn',
    title: '动态状态轮次',
    requiredBlockIds: ['state.story-dynamics', 'story.nodes.matched', 'history.path'],
    expectedIncludedBlockIds: ['state.story-dynamics', 'story.nodes.matched'],
    expectedOrder: ['state.story-dynamics', 'story.nodes.matched', 'history.path'],
    assertions: ['动态状态早于历史消息', '已完成或已跳过节点不能继续进入机会池'],
  },
  {
    id: 'retrieval-turn',
    title: '召回资料轮次',
    requiredBlockIds: ['story.facts.visible', 'story.lorebook.matched', 'state.memory', 'history.path'],
    expectedIncludedBlockIds: ['story.facts.visible', 'story.lorebook.matched'],
    expectedOrder: ['story.facts.visible', 'story.lorebook.matched', 'state.memory', 'history.path'],
    assertions: ['事实、Lorebook、记忆必须保留来源边界', '秘密事实只按知情范围注入'],
  },
]

function check(input: Omit<PromptGoldenCheck, 'status'> & { passed: boolean }) {
  return {
    id: input.id,
    scenarioId: input.scenarioId,
    title: input.title,
    status: input.passed ? ('passed' as const) : ('failed' as const),
    message: input.message,
  }
}

function appearsInOrder(blockIds: string[], expectedOrder: string[]) {
  let cursor = -1
  for (const id of expectedOrder) {
    const index = blockIds.indexOf(id)
    if (index < 0 || index <= cursor) return false
    cursor = index
  }
  return true
}

export function getPromptGoldenScenarios() {
  return promptGoldenScenarios.map((scenario) => ({
    ...scenario,
    requiredBlockIds: [...scenario.requiredBlockIds],
    expectedIncludedBlockIds: scenario.expectedIncludedBlockIds ? [...scenario.expectedIncludedBlockIds] : undefined,
    expectedOrder: [...scenario.expectedOrder],
    assertions: [...scenario.assertions],
  }))
}

export function evaluatePromptGoldenSnapshot(snapshot: PromptSnapshot, scenarioIds?: string[]) {
  const profile = getPromptProfileSnapshot()
  const enabledScenarioIds = new Set(scenarioIds || promptGoldenScenarios.map((scenario) => scenario.id))
  const scenarios = promptGoldenScenarios.filter((scenario) => enabledScenarioIds.has(scenario.id))
  const blockIds = snapshot.blocks.map((block) => block.id)
  const blockById = new Map(snapshot.blocks.map((block) => [block.id, block]))
  const duplicateIds = blockIds.filter((id, index) => blockIds.indexOf(id) !== index)
  const checks: PromptGoldenCheck[] = [
    check({
      id: 'snapshot-profile-current',
      scenarioId: 'global',
      title: 'Prompt profile 快照一致',
      passed: snapshot.profile.id === profile.id && snapshot.profile.version === profile.version,
      message:
        snapshot.profile.id === profile.id && snapshot.profile.version === profile.version
          ? `snapshot 使用 ${profile.id}@${profile.version}。`
          : `snapshot 使用 ${snapshot.profile.id}@${snapshot.profile.version}，当前 registry 是 ${profile.id}@${profile.version}。`,
    }),
    check({
      id: 'snapshot-block-ids-unique',
      scenarioId: 'global',
      title: 'Prompt block id 唯一',
      passed: duplicateIds.length === 0,
      message:
        duplicateIds.length === 0
          ? '真实 prompt snapshot 没有重复 block id。'
          : `重复 block：${duplicateIds.join('、')}`,
    }),
    check({
      id: 'input-current-last',
      scenarioId: 'global',
      title: '本轮输入置底',
      passed: blockIds.at(-1) === 'input.current',
      message: `最后一个 block 是 ${blockIds.at(-1) || '空'}。`,
    }),
  ]

  for (const scenario of scenarios) {
    const missing = scenario.requiredBlockIds.filter((id) => !blockById.has(id))
    checks.push(
      check({
        id: `${scenario.id}.required-blocks-present`,
        scenarioId: scenario.id,
        title: `${scenario.title} block 完整`,
        passed: missing.length === 0,
        message: missing.length === 0 ? '需要的 block 都存在。' : `缺少 block：${missing.join('、')}`,
      }),
    )

    const notIncluded = (scenario.expectedIncludedBlockIds || [])
      .filter((id) => blockById.has(id))
      .filter((id) => blockById.get(id)?.included !== true)
    checks.push(
      check({
        id: `${scenario.id}.included-blocks`,
        scenarioId: scenario.id,
        title: `${scenario.title} included 状态`,
        passed: notIncluded.length === 0,
        message:
          notIncluded.length === 0 ? '期望注入的 block 都已 included。' : `未注入 block：${notIncluded.join('、')}`,
      }),
    )

    checks.push(
      check({
        id: `${scenario.id}.expected-order`,
        scenarioId: scenario.id,
        title: `${scenario.title} 顺序`,
        passed: appearsInOrder(blockIds, scenario.expectedOrder),
        message: appearsInOrder(blockIds, scenario.expectedOrder)
          ? `顺序满足：${scenario.expectedOrder.join(' < ')}`
          : `顺序不满足：${scenario.expectedOrder.join(' < ')}`,
      }),
    )
  }

  return {
    passed: checks.every((item) => item.status === 'passed'),
    scenarios,
    checks,
  }
}
