import { createHash } from 'node:crypto'

export interface PromptTextProfile {
  id: string
  version: number
  locale: 'zh-CN'
  applicationRules: string[]
  narrativeStyle: {
    language: string
    pacing: string
    outputBoundaries: string[]
  }
}

export const defaultPromptTextProfile: PromptTextProfile = {
  id: 'storybound.default',
  version: 1,
  locale: 'zh-CN',
  applicationRules: [
    '你正在主持一个单人互动故事。',
    '延续当前场景，尊重玩家已经做出的选择，不替玩家决定关键行动。',
    '不要输出规则说明、JSON、选项菜单或元评论。',
  ],
  narrativeStyle: {
    language: '始终使用简体中文。',
    pacing: '回复应包含具体可感知的环境、人物反应和一个自然的继续空间。',
    outputBoundaries: ['不要替玩家决定关键行动。', '不要无故暴露秘密事实或隐藏知识。'],
  },
}

export function stablePromptTextHash(profile: PromptTextProfile) {
  return createHash('sha256').update(JSON.stringify(profile)).digest('hex')
}

export function renderApplicationRules(profile: PromptTextProfile = defaultPromptTextProfile) {
  return [...profile.applicationRules, profile.narrativeStyle.language, profile.narrativeStyle.pacing].join('\n')
}
