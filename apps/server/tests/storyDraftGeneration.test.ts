import { beforeEach, describe, expect, it } from 'bun:test'

const { db } = await import('../src/db/connection')
const { initializeCurrentSchema } = await import('../src/db/schema')
const { seedDefaultModelProvider, getDefaultProviderSnapshot } = await import('../src/repositories/modelProviders')
const { getStory } = await import('../src/repositories/stories')
const { generateStoryDraftSchema } = await import('../src/domain/schemas')
const { generateStoryDraftFromPrompt } = await import('../src/services/storyEditorService')
const { AppError } = await import('../src/shared/errors')

initializeCurrentSchema(db)
seedDefaultModelProvider()

beforeEach(() => {
  db.exec(`
    DELETE FROM operation_receipts;
    DELETE FROM generations;
    DELETE FROM runtime_checkpoints;
    DELETE FROM messages;
    DELETE FROM chapters;
    DELETE FROM conversations;
    DELETE FROM story_cards WHERE is_builtin = 0;
  `)
})

function streamText(content: string) {
  return (async function* () {
    yield { type: 'text' as const, text: content.slice(0, Math.ceil(content.length / 2)) }
    yield { type: 'text' as const, text: content.slice(Math.ceil(content.length / 2)) }
    yield { type: 'finish' as const, reason: 'stop' }
  })()
}

function generatedDraftJson() {
  return JSON.stringify({
    title: '霜灯邮局',
    summary: '一封来自明日的退信把夜班分拣员卷入小城失踪案。',
    description: '玩家在暴雪封城的旧邮局值夜班，发现每封退信都指向一个尚未发生的选择。',
    background: '霜灯镇每到冬至就会停电，旧邮局的煤油灯却会自己亮起。传说投进红色邮筒的信会寄往某个尚未到来的清晨。',
    worldRules:
      '叙事必须尊重玩家行动，不替玩家做决定；来自未来的信息只能提供线索，不能直接宣布真相；每次推进都保留可调查的具体物件。',
    contentBoundaries: ['不替玩家决定行动或情绪。', '不在无铺垫时改变玩家身份、记忆或人际关系。'],
    tags: ['悬疑', '奇幻', '小城'],
    characters: [
      {
        id: 'c1',
        name: '陆闻笙',
        roleType: 'main',
        identity: '旧邮局管理员，知道红色邮筒的禁忌。',
        appearance: '灰色长风衣，右手总戴着旧皮手套。',
        personality: '克制谨慎，不轻易说明动机。',
        speechStyle: '短句为主，常用邮政术语打比方。',
        goals: '阻止错误的信被寄出。',
        knowledgeScope: '知道邮局过去的事故，但不知道今晚是谁改写了投递记录。',
      },
    ],
    playerTemplate: {
      roleName: '夜班分拣员',
      background: '刚调来霜灯镇旧邮局，负责冬至夜最后一轮分拣。',
      goals: '查明退信来源，并决定是否投递那封写着自己名字的信。',
      defaultValues: { pronouns: '不限定' },
    },
    scenes: [
      {
        title: '红色邮筒亮起',
        description: '暴雪封住街口，旧邮局大厅只剩煤油灯和不断响起的分拣铃。',
        location: '霜灯镇旧邮局',
        time: '冬至夜 23:40',
        participantIds: ['c1'],
        entryMethod: '玩家在夜班中发现一封邮戳日期来自明日的退信。',
        openingMessage:
          '分拣铃第三次响起时，红色邮筒从内侧透出微光。柜台后的陆闻笙压低声音说：“先别碰那封信，除非你已经想好要知道明天发生什么。”',
        openingSender: 'narrator',
        openingCharacterId: null,
        isDefault: true,
      },
    ],
  })
}

describe('一句话 AI 故事草稿生成', () => {
  it('把模型返回的 JSON 保存成一份可编辑草稿', async () => {
    const provider = getDefaultProviderSnapshot()
    const result = await generateStoryDraftFromPrompt(
      generateStoryDraftSchema.parse({ prompt: '暴雪旧邮局收到来自明天的退信' }),
      { provider, stream: () => streamText(generatedDraftJson()), database: db },
    )

    expect(result.story).toMatchObject({
      title: '霜灯邮局',
      status: 'draft',
      isBuiltin: false,
    })
    expect(result.story.background.includes('红色邮筒')).toBe(true)
    expect(result.story.characters).toHaveLength(1)
    expect(result.story.characters[0].id).not.toBe('c1')
    expect(result.story.scenes[0].participantIds).toEqual([result.story.characters[0].id])
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false)
    expect(getStory(String(result.story.id), true)?.title).toBe('霜灯邮局')
  })

  it('模型没有返回合法 JSON 时不创建草稿', async () => {
    const provider = getDefaultProviderSnapshot()
    let calls = 0
    try {
      await generateStoryDraftFromPrompt(generateStoryDraftSchema.parse({ prompt: '把月亮写成一座学校' }), {
        provider,
        stream: () => {
          calls += 1
          return streamText('我会先构思，然后再输出故事。')
        },
        database: db,
      })
      throw new Error('expected generation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as { code: string }).code).toBe('MODEL_STORY_DRAFT_JSON_INVALID')
    }
    expect(calls).toBe(2)
    expect(db.query('SELECT COUNT(*) AS count FROM story_cards WHERE is_builtin = 0').get()).toEqual({ count: 0 })
  })

  it('首次输出格式错误时自动修复一次并保存草稿', async () => {
    const provider = getDefaultProviderSnapshot()
    const outputs = ['{"title":"坏掉的 JSON"', generatedDraftJson()]
    const systems: string[] = []

    const result = await generateStoryDraftFromPrompt(
      generateStoryDraftSchema.parse({ prompt: '暴雪旧邮局收到来自明天的退信' }),
      {
        provider,
        stream: (input) => {
          systems.push(input.system)
          return streamText(outputs.shift() || generatedDraftJson())
        },
        database: db,
      },
    )

    expect(result.story.title).toBe('霜灯邮局')
    expect(systems).toHaveLength(2)
    expect(systems[1]).toContain('JSON 修复器')
    expect(db.query('SELECT COUNT(*) AS count FROM story_cards WHERE is_builtin = 0').get()).toEqual({ count: 1 })
  })

  it('基于当前草稿补全时保留模型未返回的已有设定', async () => {
    const provider = getDefaultProviderSnapshot()
    const input = generateStoryDraftSchema.parse({
      prompt: '补上玩家身份和默认开场',
      baseDraft: {
        title: '',
        background: '雾港的灯塔每逢退潮都会收到来自海底的钟声。',
        worldRules: '玩家可以调查、询问或离开，但叙事不能替玩家决定行动。',
        contentBoundaries: ['不替玩家决定行动。'],
        playerTemplate: { roleName: '', background: '', goals: '', defaultValues: { pronouns: '不限定' } },
        scenes: [],
      },
    })

    const result = await generateStoryDraftFromPrompt(input, {
      provider,
      stream: () =>
        streamText(
          JSON.stringify({
            title: '雾港钟声',
            summary: '退潮夜，来自海底的钟声指向一座不存在的灯塔。',
            playerTemplate: {
              roleName: '临时灯塔看守',
              background: '受雇替旧灯塔值守一夜。',
              goals: '查明钟声来源，并决定是否回应海底的呼唤。',
            },
            scenes: [
              {
                title: '退潮之后',
                location: '雾港旧灯塔',
                time: '退潮夜',
                entryMethod: '玩家独自值守时听见海底钟声。',
                openingMessage: '灯塔玻璃被海雾打湿，退潮线外传来第一声钟响。值班日志上，昨夜的笔迹写着你的名字。',
                openingSender: 'narrator',
                openingCharacterId: null,
                isDefault: true,
              },
            ],
          }),
        ),
      database: db,
    })

    expect(result.story.title).toBe('雾港钟声')
    expect(result.story.background).toContain('海底的钟声')
    expect(result.story.worldRules).toContain('不能替玩家决定行动')
    expect(result.story.contentBoundaries).toEqual(['不替玩家决定行动。'])
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false)
  })

  it('按故事创作意图给模型明确任务方向', async () => {
    const provider = getDefaultProviderSnapshot()
    const prompts: string[] = []
    const input = generateStoryDraftSchema.parse({
      prompt: '让开场更强',
      intent: 'opening',
      baseDraft: {
        title: '雾港钟声',
        background: '雾港的灯塔每逢退潮都会收到来自海底的钟声。',
        worldRules: '叙事不能替玩家决定行动。',
      },
    })

    await generateStoryDraftFromPrompt(input, {
      provider,
      stream: (streamInput) => {
        prompts.push(streamInput.messages[0].content)
        return streamText(generatedDraftJson())
      },
      database: db,
    })

    expect(prompts[0]).toContain('任务：重写默认开场')
    expect(prompts[0]).toContain('可调查物')
    expect(prompts[0]).toContain('不得替玩家决定行动')
  })
})
