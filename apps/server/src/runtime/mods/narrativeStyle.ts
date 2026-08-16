import { z } from 'zod'
import { createPromptMod } from './promptMod'
import type { TrustedModDefinition } from './types'

const schema = z.object({
  style: z.enum(['cinematic', 'literary', 'concise']).default('cinematic'),
  sensoryDetail: z.boolean().default(true),
})
const meta = { id: 'narrative-style', name: '叙事镜头' }

const plugin = createPromptMod(meta, schema, (raw) => {
  const config = schema.parse(raw)
  const style = {
    cinematic: '采用电影化叙事：用清晰的场面调度、动作和镜头焦点推进剧情。',
    literary: '采用克制的文学化叙事：重视意象、人物细微反应和语句节奏，但避免堆砌辞藻。',
    concise: '采用紧凑叙事：减少重复描写，每次回复优先推进一个明确变化。',
  }[config.style]
  return {
    id: 'style',
    label: meta.name,
    section: 'style',
    priority: 40,
    required: false,
    content: `${style}${config.sensoryDetail ? '\n在关键场景中加入一到两项与现场一致的感官细节。' : ''}`,
  }
})

export const narrativeStyleMod: TrustedModDefinition = {
  ...meta,
  description: '控制故事正文的叙事质感和感官细节密度。',
  version: '1.0.0',
  activationPolicy: 'immediate',
  schema,
  defaultConfig: schema.parse({}),
  configFields: [
    {
      key: 'style',
      label: '叙事风格',
      type: 'select',
      options: [
        { value: 'cinematic', label: '电影化' },
        { value: 'literary', label: '文学化' },
        { value: 'concise', label: '紧凑' },
      ],
    },
    { key: 'sensoryDetail', label: '感官细节', type: 'boolean' },
  ],
  plugin,
}
