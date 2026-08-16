import { narrativePreferencesSchema } from '../../domain/schemas'
import { getConversationRow, parseJson } from '../../repositories/conversations'
import { createPromptMod } from './promptMod'
import type { TrustedModDefinition } from './types'

export const narrativePerspectiveId = 'narrative-perspective'
const meta = { id: narrativePerspectiveId, name: '叙事方式' }

const plugin = createPromptMod(meta, narrativePreferencesSchema, (raw, request) => {
  const config = narrativePreferencesSchema.parse(raw)
  const conversation = getConversationRow(request.conversationId)
  const story = parseJson<Record<string, any>>(conversation?.card_snapshot_json, {})
  const player = parseJson<Record<string, any>>(conversation?.player_snapshot_json, {})
  const character = (Array.isArray(story.characters) ? story.characters : []).find(
    (item: any) => String(item.id) === config.viewpointCharacterId,
  )
  const playerName = String(player.name || '玩家')
  const characterName = String(character?.name || '指定人物')
  const perspective = {
    first_player: `叙事正文以玩家“${playerName}”为第一人称主体，使用“我”描述玩家已经明确做出的行动、感知和想法。不得借第一人称替玩家补充未表达的决定、情绪或行动。`,
    second_player: `叙事正文以玩家“${playerName}”为视角主体，使用“你”称呼玩家。只描述玩家能够感知的信息，不替玩家决定关键行动。`,
    third_player: `叙事正文采用第三人称限知视角，主要跟随玩家“${playerName}”，使用其名字或自然的第三人称称谓；不展示玩家尚未得知的秘密。`,
    first_character: `由“${characterName}”作为第一人称叙述者，使用“我”描述该人物能够感知、回忆或合理推断的内容。玩家“${playerName}”仍是行动决策者，不把玩家行动写成叙述者的行动。`,
    third_character: `叙事正文采用第三人称限知视角，主要跟随“${characterName}”，只展示该人物能够感知、回忆或合理推断的信息。`,
    third_omniscient:
      '叙事正文采用第三人称全知视角，可以在场人物之间自然移动焦点，但不要为了展示全知而提前泄露悬念、秘密或人物尚未采取的决定。',
  }[config.perspective]
  const tense =
    config.tense === 'past'
      ? '叙事动作以过去时态组织；人物直接引语保持自然表达。'
      : '叙事动作以正在发生的当下感组织；人物直接引语保持自然表达。'
  const length = {
    compact: '每次回复保持紧凑，通常使用二到三段，只保留推进当前互动所需的细节。',
    balanced: '每次回复采用适中篇幅，通常使用三到五段，兼顾现场、人物反应和剧情推进。',
    expanded: '每次回复可以充分展开，通常使用五到八段，但不得重复信息或替玩家推进多个关键决定。',
  }[config.length]
  const dialogue = {
    low: '对白从简，以动作、环境和非语言反应承载主要信息。',
    balanced: '在对白、动作和环境描写之间保持自然平衡。',
    high: '优先用有来有往的对白推进互动，同时保留必要的动作和现场反馈，避免连续大段独白。',
  }[config.dialogueDensity]
  return {
    id: 'perspective',
    label: meta.name,
    section: 'style',
    priority: 85,
    required: true,
    content: [
      perspective,
      tense,
      length,
      dialogue,
      '这些规则只作用于后续叙事正文，不改写历史消息；引号内的角色对白保留说话者自然的人称。单次回复内不要无故切换人称或视角主体。',
    ].join('\n'),
  }
})

export const narrativePerspectiveMod: TrustedModDefinition = {
  ...meta,
  description: '控制叙述人称、视角主体、时态、篇幅和对白密度。',
  version: '1.0.0',
  activationPolicy: 'immediate',
  schema: narrativePreferencesSchema,
  defaultConfig: narrativePreferencesSchema.parse({}),
  configFields: [
    {
      key: 'perspective',
      label: '叙事视角',
      type: 'select',
      options: [
        { value: 'first_player', label: '玩家第一人称' },
        { value: 'second_player', label: '玩家第二人称' },
        { value: 'third_player', label: '玩家第三人称' },
        { value: 'first_character', label: '指定人物第一人称' },
        { value: 'third_character', label: '指定人物第三人称' },
        { value: 'third_omniscient', label: '第三人称全知' },
      ],
    },
    {
      key: 'viewpointCharacterId',
      label: '视角人物',
      type: 'character-select',
      visibleWhen: { key: 'perspective', values: ['first_character', 'third_character'] },
    },
    {
      key: 'tense',
      label: '叙事时态',
      type: 'select',
      options: [
        { value: 'present', label: '当下感' },
        { value: 'past', label: '过去式' },
      ],
    },
    {
      key: 'length',
      label: '回复篇幅',
      type: 'select',
      options: [
        { value: 'compact', label: '紧凑' },
        { value: 'balanced', label: '适中' },
        { value: 'expanded', label: '展开' },
      ],
    },
    {
      key: 'dialogueDensity',
      label: '对白密度',
      type: 'select',
      options: [
        { value: 'low', label: '少量' },
        { value: 'balanced', label: '均衡' },
        { value: 'high', label: '较多' },
      ],
    },
  ],
  plugin,
}
