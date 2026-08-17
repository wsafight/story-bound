import { describe, expect, it } from 'bun:test'
import {
  createConversationSchema,
  createRuntimeStateSchema,
  createSendMessageSchema,
  narrativePreferencesSchema,
  storyDraftSchema,
} from '../src'

describe('共享 Zod 契约', () => {
  it('为叙事配置填充默认值并校验人物视角', () => {
    expect(narrativePreferencesSchema.parse({})).toEqual({
      perspective: 'second_player',
      viewpointCharacterId: null,
      tense: 'present',
      length: 'balanced',
      targetWords: 800,
      dialogueDensity: 'balanced',
    })
    expect(
      narrativePreferencesSchema.safeParse({ perspective: 'first_character', viewpointCharacterId: null }).success,
    ).toBe(false)

    expect(
      createConversationSchema.parse({
        title: '默认叙事配置',
        sceneId: 'scene-1',
        player: { name: '测试玩家' },
      }).narrative,
    ).toEqual(narrativePreferencesSchema.parse({}))
    expect(
      createConversationSchema.parse({
        title: '无显式开场',
        player: { name: '测试玩家' },
      }).sceneId,
    ).toBeUndefined()
  })

  it('允许服务端注入消息长度上限', () => {
    const schema = createSendMessageSchema({ maxMessageChars: 4 })
    const input = {
      clientMessageId: '00000000-0000-4000-8000-000000000000',
      expectedLeafMessageId: 'message-1',
      inputMode: 'dialogue',
    }
    expect(schema.safeParse({ ...input, content: '1234' }).success).toBe(true)
    expect(schema.safeParse({ ...input, content: '12345' }).success).toBe(false)
  })

  it('为故事草稿的可选集合填充默认值', () => {
    const draft = storyDraftSchema.parse({ title: '测试故事' })
    expect(draft.characters).toEqual([])
    expect(draft.abilities).toEqual([])
    expect(draft.scenes).toEqual([])
    expect(draft.stateSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false })
    expect(draft.defaultState).toEqual({})
    expect(draft.statePolicy).toEqual([])
  })

  it('限制运行时状态中的保留字段和内置记忆集合', () => {
    const schema = createRuntimeStateSchema({ maxMessageChars: 8 })
    expect(
      schema.parse({
        phase: ' 调查 ',
        scene: { location: ' 候车室 ', participantIds: ['char-1'] },
        custom: {
          pinnedMemories: [{ messageId: 'message-1', content: '线索', createdAt: '2026-01-01T00:00:00Z' }],
          longTermMemories: [
            {
              id: 'memory-1',
              fromMessageId: 'message-1',
              toMessageId: 'message-2',
              fromDepth: 1,
              toDepth: 2,
              messageCount: 2,
              summary: '长期线索',
              facts: ['沈砚认出林舟'],
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    ).toMatchObject({
      phase: '调查',
      scene: { location: '候车室', participantIds: ['char-1'] },
    })
    expect(
      schema.safeParse({
        custom: { pinnedMemories: [{ messageId: 'message-1', content: '超过长度限制的内容', createdAt: 'now' }] },
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        custom: {
          chapterSummaries: Array.from({ length: 51 }, (_, index) => ({
            chapterId: `chapter-${index}`,
            number: index + 1,
            title: `第 ${index + 1} 章`,
            summary: '摘要',
            closedAt: 'now',
          })),
        },
      }).success,
    ).toBe(false)
  })
})
