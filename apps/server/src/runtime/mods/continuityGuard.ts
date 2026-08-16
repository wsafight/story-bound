import { z } from 'zod'
import { createPromptMod } from './promptMod'
import type { TrustedModDefinition } from './types'

const schema = z.object({
  strictness: z.enum(['standard', 'strict']).default('standard'),
  protectPlayerAgency: z.boolean().default(true),
})
const meta = { id: 'continuity-guard', name: '连续性守门' }

const plugin = createPromptMod(meta, schema, (raw) => {
  const config = schema.parse(raw)
  return {
    id: 'continuity',
    label: meta.name,
    section: 'rules',
    priority: 90,
    required: true,
    content: [
      config.strictness === 'strict'
        ? '严格核对当前场景、人物认知、既有事件和世界规则；信息不足时保持含蓄，不要自行补成既定事实。'
        : '保持地点、时间、人物认知和既有事件连续；不要让角色无依据地知道未公开信息。',
      config.protectPlayerAgency ? '不得替玩家完成关键选择、承诺或不可逆行动。' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
})

export const continuityGuardMod: TrustedModDefinition = {
  ...meta,
  description: '约束人物认知、世界事实和玩家关键选择的一致性。',
  version: '1.0.0',
  activationPolicy: 'immediate',
  schema,
  defaultConfig: schema.parse({}),
  configFields: [
    {
      key: 'strictness',
      label: '检查强度',
      type: 'select',
      options: [
        { value: 'standard', label: '标准' },
        { value: 'strict', label: '严格' },
      ],
    },
    { key: 'protectPlayerAgency', label: '保护玩家决定权', type: 'boolean' },
  ],
  plugin,
}
