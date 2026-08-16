import { z } from 'zod'
import { db } from '../../db/connection'
import { parseJson } from '../../repositories/conversations'
import type { PromptAssemblyRequest } from '../storyboundRuntime'
import { createPromptMod } from './promptMod'
import type { TrustedModDefinition } from './types'

const schema = z.object({
  pace: z.enum(['slow', 'balanced', 'fast']).default('balanced'),
  endingHook: z.boolean().default(true),
})
const meta = { id: 'pacing-director', name: '节奏导演' }

type Row = Record<string, unknown>

function rhythmSignals(request: PromptAssemblyRequest) {
  const message = db
    .query('SELECT tree_depth, runtime_checkpoint_id FROM messages WHERE id = ? AND conversation_id = ?')
    .get(request.playerMessageId, request.conversationId) as Row | null
  const checkpointId = message?.runtime_checkpoint_id ? String(message.runtime_checkpoint_id) : ''
  const checkpoint = checkpointId
    ? (db
        .query('SELECT state_json FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
        .get(checkpointId, request.conversationId) as Row | null)
    : null
  const state = parseJson<Record<string, any>>(String(checkpoint?.state_json || '{}'), {})
  const custom = state.custom && typeof state.custom === 'object' && !Array.isArray(state.custom) ? state.custom : {}
  const pendingSuggestions = Array.isArray(custom.stateSuggestions)
    ? custom.stateSuggestions.filter((item: any) => item?.status === 'pending').length
    : 0
  const activeNodes =
    custom.nodeProgress && typeof custom.nodeProgress === 'object'
      ? Object.values(custom.nodeProgress).filter((item: any) => item?.status === 'active').length
      : 0
  return { depth: Number(message?.tree_depth || 0), pendingSuggestions, activeNodes }
}

function dynamicRhythmAdvice(signals: ReturnType<typeof rhythmSignals>) {
  if (signals.pendingSuggestions > 0) {
    return `当前有 ${signals.pendingSuggestions} 条待确认状态建议；本轮优先让变化原因和后果可理解，不要制造多个新的重大转折。`
  }
  if (signals.activeNodes > 0) {
    return `当前有 ${signals.activeNodes} 个进行中的故事节点；本轮围绕进行中节点推进一个可追踪的小结果。`
  }
  if (signals.depth <= 1) {
    return '当前仍在开局阶段；本轮优先建立可行动目标、现场压力和一个可调查的具体线索。'
  }
  if (signals.depth >= 8) {
    return '当前对话已经展开多轮；本轮避免原地延展，推动一个明确发现、关系变化或局势升级。'
  }
  return '根据玩家刚刚选择，推动一个之后能被状态、事实或节点追踪的小变化。'
}

const plugin = createPromptMod(meta, schema, (raw, request) => {
  const config = schema.parse(raw)
  const pace = {
    slow: '放慢节奏，让人物反应和现场细节得到展开，本轮不强行推进多个事件。',
    balanced: '保持自然节奏，本轮完成一个小推进，同时给玩家留下清晰的回应空间。',
    fast: '加快节奏，压缩过渡描写并推动一个有意义的局势变化，但不要跳过玩家必须决定的事项。',
  }[config.pace]
  return {
    id: 'pacing',
    label: meta.name,
    section: 'director',
    priority: 50,
    required: false,
    content: `${pace}\n${dynamicRhythmAdvice(rhythmSignals(request))}${
      config.endingHook ? '\n结尾保留一个来自人物、环境或新信息的自然钩子，不要输出选项菜单。' : ''
    }`,
  }
})

export const pacingDirectorMod: TrustedModDefinition = {
  ...meta,
  description: '控制每轮剧情推进速度和回复结尾的牵引方式。',
  version: '1.0.0',
  activationPolicy: 'immediate',
  schema,
  defaultConfig: schema.parse({}),
  configFields: [
    {
      key: 'pace',
      label: '推进速度',
      type: 'select',
      options: [
        { value: 'slow', label: '放慢' },
        { value: 'balanced', label: '自然' },
        { value: 'fast', label: '加快' },
      ],
    },
    { key: 'endingHook', label: '保留结尾钩子', type: 'boolean' },
  ],
  plugin,
}
