import { getPromptGoldenScenarios } from './golden'
import { getPromptProfileSnapshot } from './registry'

function check(input: { id: string; title: string; passed: boolean; message: string; warning?: boolean }) {
  return {
    id: input.id,
    title: input.title,
    status: input.passed ? ('passed' as const) : input.warning ? ('warning' as const) : ('failed' as const),
    message: input.message,
  }
}

function appearsBefore(order: string[], first: string, second: string) {
  const firstIndex = order.indexOf(first)
  const secondIndex = order.indexOf(second)
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex
}

export function auditPromptProfile() {
  const profile = getPromptProfileSnapshot()
  const blockIds = profile.blocks.map((block) => block.id)
  const uniqueBlockIds = new Set(blockIds)
  const requiredBlockIds = profile.blocks.filter((block) => block.priority === 'required').map((block) => block.id)
  const orderMatchesDefinitions = profile.blockOrder.join('\n') === blockIds.join('\n')
  const totalBudgetRatio = profile.blocks.reduce((total, block) => total + (block.budgetRatio || 0), 0)
  const checks = [
    check({
      id: 'unique-block-ids',
      title: 'Block ID 唯一',
      passed: uniqueBlockIds.size === blockIds.length,
      message:
        uniqueBlockIds.size === blockIds.length
          ? '当前 profile 没有重复 block id。'
          : '当前 profile 存在重复 block id。',
    }),
    check({
      id: 'order-matches-definitions',
      title: '顺序定义一致',
      passed: orderMatchesDefinitions,
      message: orderMatchesDefinitions
        ? 'blockOrder 与 blocks 定义顺序一致。'
        : 'blockOrder 与 blocks 定义顺序不一致。',
    }),
    check({
      id: 'required-blocks-present',
      title: '必需块完整',
      passed: ['core.application-rules', 'story.world', 'conversation.player', 'state.scene', 'input.current'].every(
        (id) => requiredBlockIds.includes(id),
      ),
      message: `必需块：${requiredBlockIds.join('、')}`,
    }),
    check({
      id: 'input-current-last',
      title: '本轮输入置底',
      passed: profile.blockOrder.at(-1) === 'input.current',
      message: 'input.current 应保持在最后，避免被后续系统段落稀释。',
    }),
    check({
      id: 'retrieval-before-history',
      title: '召回早于历史',
      passed:
        appearsBefore(profile.blockOrder, 'story.lorebook.matched', 'history.path') &&
        appearsBefore(profile.blockOrder, 'state.memory', 'history.path'),
      message: 'Lorebook 与记忆摘要应先于历史消息注入，方便模型理解上下文边界。',
    }),
    check({
      id: 'budget-ratio-visible',
      title: '预算比例可审计',
      passed: totalBudgetRatio > 0,
      warning: true,
      message: `当前配置预算比例合计为 ${Number(totalBudgetRatio.toFixed(2))}，它用于各分段上限，不代表必须等于 1。`,
    }),
  ]
  return {
    profile,
    totalBudgetRatio: Number(totalBudgetRatio.toFixed(4)),
    checks,
    goldenScenarios: getPromptGoldenScenarios(),
  }
}
