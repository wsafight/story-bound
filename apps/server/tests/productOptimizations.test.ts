import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, it } from 'bun:test'
import { generationStreamEventSchema } from '@storybound/shared'

const { db } = await import('../src/db/connection')
const { initializeDatabase } = await import('../src/db/initialize')
const { initializeCurrentSchema } = await import('../src/db/schema')
const { seedBuiltInStories } = await import('../src/db/seed')
const { storyDraftSchema } = await import('../src/domain/schemas')
const { ModelProviderError } = await import('../src/llm/modelTypes')
const { seedDefaultModelProvider } = await import('../src/repositories/modelProviders')
const { getConversationView, getGenerationRow } = await import('../src/repositories/conversations')
const { getStory, listStoryConversations } = await import('../src/repositories/stories')
const { createBackup, getBackupPath, listBackups, restoreBackup } = await import('../src/services/backupService')
const {
  closeChapter,
  createStateSuggestion,
  evaluateRecallBenchmark,
  exportConversationMarkdown,
  forkConversation,
  getConversationBranches,
  getConversationNodeDiagnostics,
  getLorebookDiagnostics,
  getRecallDiagnostics,
  getReplyCandidateComparison,
  getStateFieldHints,
  listStateSuggestions,
  resolveStateSuggestion,
  togglePinnedMemory,
  updateConversation,
  updateConversationNodeProgress,
  updateConversationState,
  useConversationAbility,
} = await import('../src/services/conversationManagementService')
const { createConversation } = await import('../src/services/conversationService')
const { prepareRegenerate, prepareSend, runGeneration } = await import('../src/services/generationService')
const { buildModelMessages } = await import('../src/services/promptBuilder')
const { auditPromptProfile, evaluatePromptGoldenSnapshot, getPromptProfile } = await import(
  '../src/services/promptService'
)
const {
  createStoryDraft,
  duplicateStory,
  exportStoryPackage,
  importStoryPackage,
  inspectStoryImport,
  publishStory,
  updateStoryDraft,
} = await import('../src/services/storyEditorService')
const { detectStoryImportFormat, normalizeStoryImport, storyImportAdapters } = await import(
  '../src/services/storyEditor/importAdapters'
)

initializeCurrentSchema(db)
seedDefaultModelProvider()
seedBuiltInStories(db)

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

function createTestConversation(title = '优化测试存档') {
  return createConversation('story-rain-terminal', {
    title,
    sceneId: 'scene-rain-platform',
    player: { name: '测试玩家', pronouns: '不限定', note: '' },
    abilityIds: ['ability-observe'],
  }).id
}

function activePointers(conversationId: string) {
  const conversation = getConversationView(conversationId)!
  return {
    expectedLeafMessageId: String(conversation.activeLeafMessageId),
    expectedCheckpointId: String(conversation.activeCheckpointId),
  }
}

function createStructuredStory() {
  const draft = duplicateStory('story-rain-terminal')
  const mainCharacterId = String(draft.characters[0].id)
  const stateSchema = {
    type: 'object',
    properties: {
      sanity: { type: 'integer', minimum: 0, maximum: 100, title: '理智' },
      hasTicket: { type: 'boolean', title: '车票' },
    },
    required: ['sanity', 'hasTicket'],
    additionalProperties: false,
  }
  const input = storyDraftSchema.parse({
    ...draft,
    stateSchema,
    defaultState: { sanity: 80, hasTicket: false },
    statePolicy: [
      { path: '/custom/sanity', label: '理智', playerEditable: true, storyEditable: true, appManaged: false },
      { path: '/custom/hasTicket', label: '车票', playerEditable: true, storyEditable: true, appManaged: false },
    ],
    abilities: draft.abilities.map((ability, index) =>
      index === 0
        ? {
            ...ability,
            inputSchema: {
              type: 'object',
              properties: { detail: { type: 'string' } },
              additionalProperties: false,
            },
            runtime: { usesPerConversation: 1, cooldownTurns: 0, statePatch: { hasTicket: true } },
          }
        : ability,
    ),
    facts: [
      {
        id: crypto.randomUUID(),
        title: '旧车票',
        content: '旧车票可以让乘务员确认玩家曾被列车记录。',
        visibility: 'public',
        knownByCharacterIds: [],
        tags: ['线索'],
      },
      {
        id: crypto.randomUUID(),
        title: '沈砚的秘密',
        content: '沈砚知道末班车真正停靠过隧道口。',
        visibility: 'secret',
        knownByCharacterIds: [mainCharacterId],
        tags: ['秘密'],
      },
    ],
    lorebookEntries: [
      {
        id: crypto.randomUUID(),
        title: '槐安站事故',
        content: '三年前事故后的站台广播会在暴雨夜重新播报末班车。',
        keywords: ['槐安站', '末班车'],
        condition: {},
        scope: 'scene',
        sceneIds: [String(draft.scenes[0].id)],
        characterIds: [],
        chapterNumbers: [],
        priority: 'high',
        enabled: true,
      },
      {
        id: crypto.randomUUID(),
        title: '地下档案室',
        content: '蓝色档案柜保存着站务员不愿公开的交接记录。',
        keywords: ['蓝色档案柜'],
        condition: {},
        scope: 'story',
        sceneIds: [],
        characterIds: [],
        chapterNumbers: [],
        priority: 'low',
        enabled: true,
      },
    ],
    nodes: [
      {
        id: crypto.randomUUID(),
        title: '检票口开启',
        description: '玩家拿到旧车票后，检票口可以被重新打开。',
        condition: { custom: { hasTicket: true } },
        prompt: '让检票口成为下一步可调查目标。',
        enabled: true,
      },
    ],
    declarativeMods: [
      {
        id: crypto.randomUUID(),
        name: '线索回声',
        version: '1.0.0',
        description: '让线索以回声方式重复出现。',
        prompt: '每次推进时重复一个已经确认但尚未解释的细节。',
        enabledByDefault: true,
        configSchema: { type: 'object', properties: {}, additionalProperties: false },
        defaultConfig: {},
      },
    ],
    scenes: draft.scenes.map((scene) => ({
      ...scene,
      initialState: { ...scene.initialState, custom: { sanity: 80, hasTicket: false } },
    })),
  })
  const updated = updateStoryDraft(String(draft.id), input)
  publishStory(String(updated.id))
  return updated
}

describe('产品管理与本地缓存支撑能力', () => {
  it('允许只有前情和设定的故事发布，并从默认开场创建存档', () => {
    const draft = storyDraftSchema.parse({
      title: '雾港来信',
      background: '三年前寄出的信在今夜抵达雾港，信封上的邮戳来自尚未建成的车站。',
      worldRules: '叙事必须遵守玩家行动，不替玩家做决定；未知事实只能通过调查逐步揭示。',
    })
    const story = createStoryDraft(draft)
    const issues = publishStory(String(story.id)).issues
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false)
    expect(issues.find((issue) => issue.path === 'scenes')?.severity).toBe('warning')

    const conversationId = createConversation(String(story.id), {
      title: '雾港来信 · 新存档',
      player: { name: '林舟', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id
    const conversation = getConversationView(conversationId)!

    expect(conversation.scene).toMatchObject({
      title: '默认开场',
      location: '雾港来信',
      time: '故事开始',
      openingSender: 'narrator',
    })
    expect(conversation.state).toMatchObject({
      phase: '故事开始',
      scene: { location: '雾港来信', time: '故事开始', participantIds: [] },
      custom: {},
    })
    expect(conversation.messages).toHaveLength(1)
    expect(conversation.messages[0]).toMatchObject({
      sender: 'narrator',
      content: draft.background,
    })
  })

  it('服务启动时把遗留活跃生成标记为失败，并保留玩家消息和检查点', () => {
    const acceptedConversationId = createTestConversation('启动恢复 accepted')
    const acceptedBefore = activePointers(acceptedConversationId)
    const accepted = prepareSend(acceptedConversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: acceptedBefore.expectedLeafMessageId,
      content: '触发 accepted 遗留任务',
      inputMode: 'action',
    })

    const streamingConversationId = createTestConversation('启动恢复 streaming')
    const streamingBefore = activePointers(streamingConversationId)
    const streaming = prepareSend(streamingConversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: streamingBefore.expectedLeafMessageId,
      content: '触发 streaming 遗留任务',
      inputMode: 'action',
    })
    db.query("UPDATE generations SET status = 'streaming', started_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      streaming.id,
    )

    initializeDatabase()

    for (const generationId of [accepted.id, streaming.id]) {
      expect(getGenerationRow(generationId)).toMatchObject({
        status: 'failed',
        error_code: 'SERVER_RESTARTED',
      })
      expect(getGenerationRow(generationId)?.finished_at).toBeTruthy()
    }

    const acceptedConversation = getConversationView(acceptedConversationId)!
    expect(acceptedConversation.activeGeneration).toBeNull()
    expect(acceptedConversation.activeCheckpointId).toBe(acceptedBefore.expectedCheckpointId)
    expect(acceptedConversation.messages.map((message) => message.id)).toContain(accepted.playerMessageId)

    const streamingConversation = getConversationView(streamingConversationId)!
    expect(streamingConversation.activeGeneration).toBeNull()
    expect(streamingConversation.activeCheckpointId).toBe(streamingBefore.expectedCheckpointId)
    expect(streamingConversation.messages.map((message) => message.id)).toContain(streaming.playerMessageId)
  })

  it('生成服务发出的 SSE 事件都能被共享判别联合解析，并拒绝未知事件', async () => {
    const completedConversationId = createTestConversation('SSE completed 契约')
    const completedBefore = activePointers(completedConversationId)
    const completedPrepared = prepareSend(completedConversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: completedBefore.expectedLeafMessageId,
      content: '推进到完成事件',
      inputMode: 'action',
    })
    const completedEvents: string[] = []
    await runGeneration(
      completedPrepared,
      (event) => {
        expect(generationStreamEventSchema.safeParse(event).success).toBe(true)
        completedEvents.push(event.event)
      },
      {
        stream: async function* () {
          yield { type: 'text' as const, text: '雨声停在门外。' }
          yield { type: 'finish' as const, reason: 'stop' }
        },
      },
    )
    expect(completedEvents).toEqual(['accepted', 'delta', 'completed'])

    const failedConversationId = createTestConversation('SSE error 契约')
    const failedBefore = activePointers(failedConversationId)
    const failedPrepared = prepareSend(failedConversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: failedBefore.expectedLeafMessageId,
      content: '推进到错误事件',
      inputMode: 'action',
    })
    const failedEvents: string[] = []
    await runGeneration(
      failedPrepared,
      (event) => {
        expect(generationStreamEventSchema.safeParse(event).success).toBe(true)
        failedEvents.push(event.event)
      },
      {
        stream: async function* () {
          throw new Error('network unavailable')
        },
      },
    )
    expect(failedEvents).toEqual(['accepted', 'error'])
    expect(generationStreamEventSchema.safeParse({ event: 'unknown', data: {} }).success).toBe(false)
  })

  it('乐观锁和 operationId 幂等保护生成竞态', async () => {
    const staleSendConversationId = createTestConversation('过期 leaf 发送')
    const staleBefore = activePointers(staleSendConversationId)
    prepareSend(staleSendConversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: staleBefore.expectedLeafMessageId,
      content: '先保存一条玩家消息',
      inputMode: 'action',
    })
    expect(() =>
      prepareSend(staleSendConversationId, {
        clientMessageId: crypto.randomUUID(),
        expectedLeafMessageId: staleBefore.expectedLeafMessageId,
        content: '使用过期 leaf 再发送',
        inputMode: 'action',
      }),
    ).toThrow('剧情已在其他位置更新')

    const staleCheckpointConversationId = createTestConversation('过期 checkpoint 状态')
    const checkpointBefore = activePointers(staleCheckpointConversationId)
    togglePinnedMemory(staleCheckpointConversationId, {
      messageId: checkpointBefore.expectedLeafMessageId,
      ...checkpointBefore,
    })
    expect(() =>
      updateConversationState(staleCheckpointConversationId, {
        custom: {},
        ...checkpointBefore,
      }),
    ).toThrow('剧情已经变化')

    const regenerateConversationId = createTestConversation('重新生成幂等')
    const sendBefore = activePointers(regenerateConversationId)
    const prepared = prepareSend(regenerateConversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: sendBefore.expectedLeafMessageId,
      content: '请求第一版回复',
      inputMode: 'dialogue',
    })
    await runGeneration(prepared, () => undefined, {
      stream: async function* () {
        yield { type: 'text' as const, text: '第一版回复。' }
        yield { type: 'finish' as const, reason: 'stop' }
      },
    })
    const firstReplyId = String(getConversationView(regenerateConversationId)?.activeLeafMessageId)
    const operationId = crypto.randomUUID()
    const firstRegenerate = prepareRegenerate(regenerateConversationId, {
      operationId,
      expectedLeafMessageId: firstReplyId,
    })
    const duplicateRegenerate = prepareRegenerate(regenerateConversationId, {
      operationId,
      expectedLeafMessageId: firstReplyId,
    })
    expect(duplicateRegenerate).toMatchObject({
      id: firstRegenerate.id,
      playerMessageId: firstRegenerate.playerMessageId,
      duplicate: true,
    })
    expect(() =>
      prepareRegenerate(regenerateConversationId, {
        operationId,
        expectedLeafMessageId: 'different-leaf',
      }),
    ).toThrow('操作编号已经用于其他请求')
    expect(() =>
      prepareRegenerate(regenerateConversationId, {
        operationId: crypto.randomUUID(),
        expectedLeafMessageId: firstReplyId,
      }),
    ).toThrow('当前对话正在生成回复')
  })

  it('Provider 报上下文超限时最多清理历史并自动重试一次', async () => {
    const conversationId = createTestConversation('上下文降级重试')
    const firstBefore = activePointers(conversationId)
    const first = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: firstBefore.expectedLeafMessageId,
      content: '先推进一轮，制造可裁剪历史。',
      inputMode: 'action',
    })
    await runGeneration(first, () => undefined, {
      stream: async function* () {
        yield { type: 'text' as const, text: '第一轮回复。' }
        yield { type: 'finish' as const, reason: 'stop' }
      },
    })

    const secondBefore = activePointers(conversationId)
    const second = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: secondBefore.expectedLeafMessageId,
      content: '触发上下文超限重试。',
      inputMode: 'action',
    })
    const messageCounts: number[] = []
    const events: string[] = []
    let attempts = 0
    await runGeneration(second, (event) => events.push(event.event), {
      stream: async function* (input) {
        attempts += 1
        messageCounts.push(input.messages.length)
        if (attempts === 1) {
          throw new ModelProviderError('MODEL_CONTEXT_LIMIT', '当前上下文超过模型限制', false)
        }
        yield { type: 'text' as const, text: '降级后回复。' }
        yield { type: 'finish' as const, reason: 'stop' }
      },
    })

    expect(attempts).toBe(2)
    expect(messageCounts[0]).toBeGreaterThan(1)
    expect(messageCounts[1]).toBe(1)
    expect(events).toEqual(['accepted', 'delta', 'completed'])
    const generation = getGenerationRow(second.id)!
    const estimate = JSON.parse(String(generation.context_estimate_json)) as Record<string, any>
    expect(estimate.contextLimitRetry).toMatchObject({
      reason: 'MODEL_CONTEXT_LIMIT',
      retryCount: 1,
      removedHistoryMessages: messageCounts[0] - 1,
      retainedHistoryMessages: 0,
    })
    expect(JSON.stringify(estimate.contextLimitRetry)).not.toContain('先推进一轮')
  })

  it('Prompt profile 集中描述 block 顺序、预算和快照版本', async () => {
    const profile = getPromptProfile()
    expect(profile.id).toBe('storybound.default')
    expect(profile.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(profile.locale).toBe('zh-CN')
    expect(profile.textHash).toMatch(/^[a-f0-9]{64}$/)
    expect(profile.style.outputBoundaries).toContain('不要替玩家决定关键行动。')
    expect(profile.blockOrder).toContain('story.lorebook.matched')
    expect(profile.blocks.find((block) => block.id === 'story.lorebook.matched')).toMatchObject({
      title: '世界书资料',
      budgetRatio: 0.08,
      scopeLabel: '关键词与条件召回',
    })
    const audit = auditPromptProfile()
    expect(audit.profile.hash).toBe(profile.hash)
    expect(audit.checks.every((item) => item.status !== 'failed')).toBe(true)
    expect(audit.goldenScenarios.map((scenario) => scenario.id)).toContain('retrieval-turn')

    const conversationId = createTestConversation()
    const before = activePointers(conversationId)
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '检查 prompt profile',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    expect(prompt.contextEstimate.promptSnapshot?.profile).toMatchObject({
      id: profile.id,
      version: profile.version,
      hash: profile.hash,
    })
    expect(typeof prompt.contextEstimate.assemblyMetrics?.dbQueryCount).toBe('number')
    expect(typeof prompt.contextEstimate.assemblyMetrics?.durationMs).toBe('number')
    expect(typeof prompt.contextEstimate.assemblyMetrics?.measuredAt).toBe('string')
    expect(prompt.contextEstimate.assemblyMetrics?.dbQueryCount).toBeGreaterThan(0)
    expect(JSON.stringify(prompt.contextEstimate.assemblyMetrics)).not.toContain('检查 prompt profile')
  })

  it('Prompt golden tests 锁定真实组装顺序和动态召回块', async () => {
    const story = createStructuredStory()
    const abilityId = String(story.abilities[0].id)
    const conversationId = createConversation(String(story.id), {
      title: 'Prompt golden 存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [abilityId],
    }).id
    const before = activePointers(conversationId)
    useConversationAbility(conversationId, {
      abilityId,
      input: { detail: '拿出旧车票' },
      statePatch: {},
      ...before,
    })
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '观察槐安站的检票口，确认末班车广播',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    const golden = evaluatePromptGoldenSnapshot(prompt.contextEstimate.promptSnapshot!)
    const failed = golden.checks.filter((item) => item.status === 'failed')
    const blocks = prompt.contextEstimate.promptSnapshot?.blocks || []

    expect(failed).toEqual([])
    expect(blocks.at(-1)?.id).toBe('input.current')
    expect(blocks.find((block) => block.id === 'state.story-dynamics')).toMatchObject({ included: true })
    expect(blocks.find((block) => block.id === 'story.lorebook.matched')).toMatchObject({ included: true })
    expect(blocks.find((block) => block.id === 'story.nodes.matched')).toMatchObject({ included: true })
  })

  it('固定当前路径消息时创建检查点，并把记忆加入后续提示词', async () => {
    const conversationId = createTestConversation()
    const before = activePointers(conversationId)
    const result = togglePinnedMemory(conversationId, {
      messageId: before.expectedLeafMessageId,
      ...before,
    })

    expect(result.pinned).toBe(true)
    expect(result.activeCheckpointId).not.toBe(before.expectedCheckpointId)
    expect(result.state.custom.pinnedMemories).toHaveLength(1)
    expect(
      db.query('SELECT parent_checkpoint_id FROM runtime_checkpoints WHERE id = ?').get(result.activeCheckpointId),
    ).toEqual({ parent_checkpoint_id: before.expectedCheckpointId })

    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '检查固定记忆是否生效',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    expect(prompt.system).toContain('已确认的长期记忆、章节回顾与固定记忆')
    expect(prompt.system).toContain('你比时刻表晚了三年')
  })

  it('每个故事的新存档都默认带上空的固定记忆和长期记忆', () => {
    const conversationId = createTestConversation('默认记忆存档')
    const conversation = getConversationView(conversationId)!
    expect(conversation.state.custom?.pinnedMemories).toEqual([])
    expect(conversation.state.custom?.longTermMemories).toEqual([])
  })

  it('超过六轮后把旧路径压缩为长期记忆，并只保留最近两轮完整原文', async () => {
    const conversationId = createTestConversation('长期记忆存档')
    const longRoundTwo = `第2轮模型回复，推进线索2。${'旧回复细节，'.repeat(20)}不能整段反复提交给模型。`
    for (let index = 1; index <= 7; index += 1) {
      const before = activePointers(conversationId)
      const prepared = prepareSend(conversationId, {
        clientMessageId: crypto.randomUUID(),
        expectedLeafMessageId: before.expectedLeafMessageId,
        content: `第${index}轮玩家行动，记录线索${index}`,
        inputMode: 'action',
      })
      await runGeneration(prepared, () => undefined, {
        stream: async function* () {
          yield {
            type: 'text' as const,
            text: index === 2 ? longRoundTwo : `第${index}轮模型回复，推进线索${index}`,
          }
          yield { type: 'finish' as const, reason: 'stop' }
        },
      })
    }

    const conversation = getConversationView(conversationId)!
    const longTermMemories = conversation.state.custom?.longTermMemories || []
    expect(longTermMemories.length).toBeGreaterThan(0)
    expect(longTermMemories[0].facts.join(' ')).toContain('第1轮玩家行动')
    expect(longTermMemories[0].summary).toContain('第1轮')

    const beforeNext = activePointers(conversationId)
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: beforeNext.expectedLeafMessageId,
      content: '第8轮玩家行动，检查短期上下文',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    const historyBlock = prompt.contextEstimate.promptSnapshot?.blocks.find((block) => block.id === 'history.path')

    expect(prompt.contextEstimate.history.includedMessages).toBeLessThanOrEqual(12)
    expect(prompt.contextEstimate.history.omittedMessages).toBeGreaterThan(0)
    expect(historyBlock).toMatchObject({ reason: 'short_term_window' })
    expect(prompt.system).toContain('已确认的长期记忆、章节回顾与固定记忆')
    expect(prompt.system).toContain('第1轮玩家行动')
    expect(JSON.stringify(prompt.messages)).not.toContain('第1轮玩家行动')
    expect(JSON.stringify(prompt.messages)).not.toContain('不能整段反复提交给模型')
    expect(JSON.stringify(prompt.messages)).toContain('第2轮模型回复，推进线索2')
  })

  it('上下文估算暴露每段提示词的来源、作用域和预算', async () => {
    const conversationId = createTestConversation()
    const before = activePointers(conversationId)
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '检查上下文说明',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)

    expect(prompt.contextEstimate.segments.find((segment) => segment.name === '故事背景与世界规则')).toMatchObject({
      source: '故事卡快照',
      scope: '故事',
      priority: 'required',
      included: true,
    })
    expect(prompt.contextEstimate.segments.find((segment) => segment.name === '历史消息')).toMatchObject({
      source: '消息路径',
      scope: '当前分支',
      priority: 'medium',
    })
    expect(prompt.contextEstimate.segments.every((segment) => segment.budget === undefined || segment.budget > 0)).toBe(
      true,
    )
    expect(prompt.contextEstimate.promptSnapshot).toMatchObject({
      version: 1,
      compiler: 'storybound.prompt-blocks',
      budget: { requestBudget: prompt.contextEstimate.requestBudget },
    })
    const blocks = prompt.contextEstimate.promptSnapshot?.blocks || []
    expect(blocks.find((block) => block.id === 'core.application-rules')).toMatchObject({
      source: 'core',
      scope: 'app',
      priority: 'required',
      included: true,
    })
    expect(blocks.find((block) => block.id === 'story.world')?.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(prompt.contextEstimate.promptSnapshot?.historyMessageIds).toContain(prepared.playerMessageId)
  })

  it('结束章节后创建下一章，并把可编辑回顾加入后续提示词', async () => {
    const conversationId = createTestConversation()
    const before = activePointers(conversationId)
    const result = closeChapter(conversationId, {
      title: '雨夜抵达',
      summary: '调查员抵达槐安站，并见到了知道其姓名的乘务员。',
      ...before,
    })

    expect(result.currentChapter).toMatchObject({ number: 2, title: '第 2 章', status: 'active' })
    expect(
      db
        .query('SELECT number, title, status FROM chapters WHERE conversation_id = ? AND number = 1')
        .get(conversationId),
    ).toEqual({ number: 1, title: '雨夜抵达', status: 'completed' })
    expect(db.query('SELECT COUNT(*) AS count FROM chapters WHERE conversation_id = ?').get(conversationId)).toEqual({
      count: 2,
    })

    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '开始调查站台',
      inputMode: 'action',
    })
    const playerMessage = db.query('SELECT chapter_id FROM messages WHERE id = ?').get(prepared.playerMessageId)
    expect(playerMessage).toEqual({ chapter_id: result.currentChapter.id })
    expect((await buildModelMessages(conversationId, prepared.playerMessageId)).system).toContain(
      '调查员抵达槐安站，并见到了知道其姓名的乘务员。',
    )
  })

  it('支持重命名、归档只读和恢复存档', () => {
    const conversationId = createTestConversation()
    updateConversation(conversationId, { title: '重新命名的存档' })
    expect(listStoryConversations('story-rain-terminal').find((item) => item.id === conversationId)?.title).toBe(
      '重新命名的存档',
    )

    updateConversation(conversationId, { status: 'archived' })
    expect(getConversationView(conversationId)?.status).toBe('archived')
    expect(() =>
      prepareSend(conversationId, {
        clientMessageId: crypto.randomUUID(),
        expectedLeafMessageId: activePointers(conversationId).expectedLeafMessageId,
        content: '归档后不应继续写入',
        inputMode: 'action',
      }),
    ).toThrow('这个对话当前不能继续')

    updateConversation(conversationId, { status: 'active' })
    expect(getConversationView(conversationId)?.status).toBe('active')
  })

  it('按当前采用路径导出带人物和章节的 Markdown', () => {
    const conversationId = createTestConversation('导出测试')
    const pointers = activePointers(conversationId)
    closeChapter(conversationId, {
      title: '第一幕',
      summary: '确认末班车在停运车站出现。',
      ...pointers,
    })
    const markdown = exportConversationMarkdown(conversationId)
    expect(markdown).toStartWith('# 导出测试\n')
    expect(markdown).toContain('> 故事：雨夜终站')
    expect(markdown).toContain('**沈砚**')
    expect(markdown).toContain('## 第一幕')
    expect(markdown).toContain('## 章节回顾')
    expect(markdown).toContain('确认末班车在停运车站出现。')
  })

  it('使用 SQLite 一致性快照创建、列出并打开备份', () => {
    const conversationId = createTestConversation('备份中的存档')
    const backup = createBackup()
    expect(listBackups()).toContainEqual(backup)
    const backupDb = new Database(getBackupPath(backup.name), { readonly: true })
    try {
      expect(backupDb.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
      expect(backupDb.query('SELECT title FROM conversations WHERE id = ?').get(conversationId)).toEqual({
        title: '备份中的存档',
      })
    } finally {
      backupDb.close()
    }
    expect(() => getBackupPath('../story.db')).toThrow('没有找到这个备份')
  })

  it('从本地备份事务性恢复数据库并创建安全备份', () => {
    const conversationId = createTestConversation('恢复前存档')
    const backup = createBackup()
    updateConversation(conversationId, { title: '恢复前已修改' })

    const restored = restoreBackup(backup.name)
    expect(restored.restored).toBe(backup.name)
    expect(restored.safetyBackup.name).toMatch(/^storybound-\d{8}T\d{6}-[a-f0-9]{8}\.sqlite$/)
    expect(getConversationView(conversationId)?.title).toBe('恢复前存档')
  })

  it('编辑故事时保留仍存在的子项 ID 和场景引用', () => {
    const draft = duplicateStory('story-rain-terminal')
    const before = {
      characterIds: draft.characters.map((item) => item.id),
      abilityIds: draft.abilities.map((item) => item.id),
      sceneIds: draft.scenes.map((item) => item.id),
      playerTemplateId: draft.playerTemplate.id,
      participantIds: draft.scenes[0].participantIds,
      openingCharacterId: draft.scenes[0].openingCharacterId,
    }
    const input = storyDraftSchema.parse({ ...draft, title: `${draft.title} 已编辑` })
    const updated = updateStoryDraft(String(draft.id), input)

    expect(updated.characters.map((item) => item.id)).toEqual(before.characterIds)
    expect(updated.abilities.map((item) => item.id)).toEqual(before.abilityIds)
    expect(updated.scenes.map((item) => item.id)).toEqual(before.sceneIds)
    expect(updated.playerTemplate.id).toBe(before.playerTemplateId)
    expect(updated.scenes[0].participantIds).toEqual(before.participantIds)
    expect(updated.scenes[0].openingCharacterId).toBe(before.openingCharacterId)
    expect(getStory(String(draft.id), true)?.version).toBe(Number(draft.version) + 1)
  })

  it('用动态 JSON Schema 校验故事自定义状态', () => {
    const draft = duplicateStory('story-rain-terminal')
    const stateSchema = {
      type: 'object',
      properties: {
        sanity: { type: 'integer', minimum: 0, maximum: 100 },
        hasTicket: { type: 'boolean' },
      },
      required: ['sanity'],
      additionalProperties: false,
    }
    const input = storyDraftSchema.parse({
      ...draft,
      stateSchema,
      defaultState: { sanity: 80, hasTicket: false },
      scenes: draft.scenes.map((scene) => ({
        ...scene,
        initialState: { ...scene.initialState, custom: { sanity: 65, hasTicket: true } },
      })),
    })
    const updated = updateStoryDraft(String(draft.id), input)
    publishStory(String(updated.id))
    const conversationId = createConversation(String(updated.id), {
      title: '动态状态存档',
      sceneId: String(updated.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id

    expect(getStory(String(updated.id), true)?.stateSchema).toEqual(stateSchema)
    expect(getConversationView(conversationId)?.state.custom).toMatchObject({ sanity: 65, hasTicket: true })
  })

  it('允许用户提交受 Schema 约束的状态补丁并记录时间线事件', async () => {
    const story = createStructuredStory()
    const conversationId = createConversation(String(story.id), {
      title: '状态编辑存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id
    const before = activePointers(conversationId)
    const result = updateConversationState(conversationId, { custom: { sanity: 70 }, ...before })

    expect(result.state.custom).toMatchObject({ sanity: 70, hasTicket: false })
    expect(result.event.kind).toBe('state_updated')
    expect(result.event.payload.diff).toContainEqual({
      path: '/custom/sanity',
      before: 80,
      after: 70,
    })
    expect(
      db.query('SELECT kind FROM conversation_events WHERE runtime_checkpoint_id = ?').get(result.activeCheckpointId),
    ).toEqual({ kind: 'state_updated' })
    expect(() =>
      updateConversationState(conversationId, {
        custom: { unknownField: true },
        expectedLeafMessageId: before.expectedLeafMessageId,
        expectedCheckpointId: result.activeCheckpointId,
      }),
    ).toThrow('自定义状态')

    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '观察当前状态变化',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    expect(prompt.system).toContain('动态故事状态')
    expect(prompt.system).toContain('状态 理智（sanity）：70')
    expect(
      prompt.contextEstimate.promptSnapshot?.blocks.find((block) => block.id === 'state.story-dynamics'),
    ).toMatchObject({
      source: 'state',
      scope: 'conversation',
      priority: 'high',
      included: true,
    })
  })

  it('执行能力时校验输入、提交确定性状态并限制使用次数', () => {
    const story = createStructuredStory()
    const abilityId = String(story.abilities[0].id)
    const conversationId = createConversation(String(story.id), {
      title: '能力执行存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [abilityId],
    }).id
    const before = activePointers(conversationId)
    const result = useConversationAbility(conversationId, {
      abilityId,
      input: { detail: '检查旧车票' },
      statePatch: {},
      ...before,
    })

    expect(result.state.custom).toMatchObject({ hasTicket: true })
    expect(result.state.custom.abilityUses?.[abilityId]?.count).toBe(1)
    expect(result.event.kind).toBe('ability_used')
    expect(result.event.payload.diff).toContainEqual({
      path: '/custom/hasTicket',
      before: false,
      after: true,
    })
    expect(() =>
      useConversationAbility(conversationId, {
        abilityId,
        input: { detail: '再次使用' },
        statePatch: {},
        expectedLeafMessageId: before.expectedLeafMessageId,
        expectedCheckpointId: result.activeCheckpointId,
      }),
    ).toThrow('使用次数')
  })

  it('状态变化建议需要显式接受后才写入故事状态', () => {
    const story = createStructuredStory()
    const conversationId = createConversation(String(story.id), {
      title: '状态建议存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id
    const before = activePointers(conversationId)
    const created = createStateSuggestion(conversationId, {
      title: '获得旧车票',
      summary: '模型建议玩家拿到了旧车票。',
      patch: { hasTicket: true },
      source: 'model',
      ...before,
    })
    const suggestionId = created.state.custom.stateSuggestions?.[0]?.id

    expect(created.state.custom.hasTicket).toBe(false)
    expect(created.event.kind).toBe('state_suggestion_created')
    expect(created.event.payload.diff).toContainEqual({
      path: '/custom/hasTicket',
      before: false,
      after: true,
    })
    expect(suggestionId).toBeTruthy()
    expect(created.state.custom.stateSuggestions?.[0]?.diff).toContainEqual({
      path: '/custom/hasTicket',
      before: false,
      after: true,
    })
    expect(listStateSuggestions(conversationId)[0]).toMatchObject({
      id: suggestionId,
      status: 'pending',
      diff: [{ path: '/custom/hasTicket', before: false, after: true }],
    })
    expect(getStateFieldHints(conversationId).find((field) => field.key === 'hasTicket')).toMatchObject({
      label: '车票',
      playerEditable: true,
      protectedReason: null,
    })
    expect(getStateFieldHints(conversationId).find((field) => field.key === 'nodeProgress')).toMatchObject({
      appManaged: true,
      protectedReason: '应用管理字段',
    })

    const accepted = resolveStateSuggestion(conversationId, {
      suggestionId: String(suggestionId),
      accept: true,
      expectedLeafMessageId: before.expectedLeafMessageId,
      expectedCheckpointId: created.activeCheckpointId,
    })
    expect(accepted.state.custom.hasTicket).toBe(true)
    expect(accepted.state.custom.stateSuggestions?.[0]?.status).toBe('accepted')
    expect(accepted.event.kind).toBe('state_suggestion_accepted')
    expect(accepted.event.payload.diff).toContainEqual({
      path: '/custom/hasTicket',
      before: false,
      after: true,
    })
  })

  it('节点服务可以诊断、激活并完成故事节点', () => {
    const story = createStructuredStory()
    const abilityId = String(story.abilities[0].id)
    const nodeId = String(story.nodes[0].id)
    const conversationId = createConversation(String(story.id), {
      title: '节点服务存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [abilityId],
    }).id
    const before = activePointers(conversationId)
    expect(getConversationNodeDiagnostics(conversationId)[0]).toMatchObject({
      nodeId,
      status: 'locked',
      availableActions: [],
    })

    const used = useConversationAbility(conversationId, {
      abilityId,
      input: { detail: '拿出旧车票' },
      statePatch: {},
      ...before,
    })
    expect(getConversationNodeDiagnostics(conversationId)[0]).toMatchObject({
      nodeId,
      status: 'available',
      availableActions: ['activate', 'complete', 'skip'],
    })

    const activated = updateConversationNodeProgress(conversationId, nodeId, 'activate', {
      expectedLeafMessageId: before.expectedLeafMessageId,
      expectedCheckpointId: used.activeCheckpointId,
    })
    expect(activated.event.kind).toBe('node_progress_updated')
    expect(activated.state.custom.nodeProgress[nodeId].status).toBe('active')

    const completed = updateConversationNodeProgress(conversationId, nodeId, 'complete', {
      expectedLeafMessageId: before.expectedLeafMessageId,
      expectedCheckpointId: activated.activeCheckpointId,
      note: '玩家已经完成检票口调查',
    })
    expect(completed.state.custom.nodeProgress[nodeId].status).toBe('completed')
    expect(getConversationNodeDiagnostics(conversationId)[0]).toMatchObject({
      status: 'completed',
      availableActions: [],
      blockedReason: 'terminal',
    })
  })

  it('可以从当前路径上的历史消息派生独立存档', () => {
    const conversationId = createTestConversation('主线存档')
    const openingId = String(getConversationView(conversationId)?.activeLeafMessageId)
    prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: openingId,
      content: '先检查站台边缘',
      inputMode: 'action',
    })

    const forked = forkConversation(conversationId, { messageId: openingId, title: '站台分支' })
    expect(forked.id).not.toBe(conversationId)
    expect(forked.title).toBe('站台分支')
    expect(forked.messages).toHaveLength(1)
    expect(forked.messages[0].content).toContain('你比时刻表晚了三年')
    expect(forked.activeCheckpointId).not.toBe(getConversationView(conversationId)?.activeCheckpointId)
    expect(
      db
        .query(
          "SELECT COUNT(*) AS count FROM conversation_events WHERE conversation_id = ? AND kind = 'conversation_forked'",
        )
        .get(conversationId),
    ).toEqual({ count: 1 })

    const sourceBranches = getConversationBranches(conversationId)
    expect(sourceBranches.source?.childConversationId).toBe(forked.id)
    const forkBranches = getConversationBranches(forked.id)
    expect(forkBranches.source).toMatchObject({ sourceConversationId: conversationId, sourceMessageId: openingId })
    expect(forkBranches.activePathIds).toContain(forked.activeLeafMessageId)
  })

  it('分支树和候选比较暴露最后一轮版本关系', () => {
    const conversationId = createTestConversation('候选比较存档')
    const before = activePointers(conversationId)
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '调查检票口',
      inputMode: 'action',
    })
    const conversation = getConversationView(conversationId)!
    const playerRow = db
      .query('SELECT chapter_id, tree_depth FROM messages WHERE id = ?')
      .get(prepared.playerMessageId) as Record<string, any>
    const firstReplyId = crypto.randomUUID()
    const secondReplyId = crypto.randomUUID()
    for (const [messageId, content, createdAt] of [
      [firstReplyId, '乘务员递来第一种解释。', '2026-08-17T00:00:00.000Z'],
      [secondReplyId, '广播里传来另一种解释。', '2026-08-17T00:00:00.001Z'],
    ]) {
      db.query(`
        INSERT INTO messages (
          id, conversation_id, chapter_id, parent_message_id, runtime_checkpoint_id,
          sender, content, tree_depth, created_at
        ) VALUES (?, ?, ?, ?, ?, 'narrator', ?, ?, ?)
      `).run(
        messageId,
        conversationId,
        playerRow.chapter_id,
        prepared.playerMessageId,
        conversation.activeCheckpointId,
        content,
        Number(playerRow.tree_depth) + 1,
        createdAt,
      )
    }
    db.query('UPDATE conversations SET active_leaf_message_id = ? WHERE id = ?').run(secondReplyId, conversationId)

    const comparison = getReplyCandidateComparison(conversationId)
    expect(comparison.activeParentMessageId).toBe(prepared.playerMessageId)
    expect(comparison.candidates).toHaveLength(2)
    expect(comparison.candidates[1]).toMatchObject({
      siblingIndex: 2,
      isActive: true,
      contentPreview: '广播里传来另一种解释。',
    })

    const branches = getConversationBranches(conversationId)
    expect(branches.branchPoints).toContainEqual({ messageId: prepared.playerMessageId, childCount: 2 })
    expect(branches.activePathIds).toContain(secondReplyId)
    expect(branches.nodes.find((node) => node.message.id === firstReplyId)).toMatchObject({ onActivePath: false })
  })

  it('故事卡包导出包含动态状态、事实、节点和声明式 MOD', () => {
    const story = createStructuredStory()
    const exported = exportStoryPackage(String(story.id))
    expect(exported.format).toBe('storybound.story-card')
    expect(exported.formatVersion).toBe(1)
    expect(exported.story.stateSchema).toEqual(story.stateSchema)
    expect(exported.story.facts).toHaveLength(2)
    expect(exported.story.lorebookEntries).toHaveLength(2)
    expect(exported.story.lorebookEntries[0].title).toBe('槐安站事故')
    expect(exported.story.nodes[0].title).toBe('检票口开启')
    expect(exported.story.declarativeMods[0].name).toBe('线索回声')
  })

  it('故事卡包导入支持 dry-run 报告并创建草稿', () => {
    const story = createStructuredStory()
    const exported = exportStoryPackage(String(story.id))
    expect(storyImportAdapters.map((adapter) => adapter.id)).toEqual(['storybound', 'sillytavern-character'])
    expect(detectStoryImportFormat(normalizeStoryImport({ package: exported, dryRun: true }))?.id).toBe('storybound')
    const inspected = inspectStoryImport({ package: exported, dryRun: true })
    expect(inspected.report).toMatchObject({
      adapter: 'storybound',
      canImport: true,
      dryRun: true,
      storyTitle: story.title,
      counts: { lorebookEntries: 2, nodes: 1 },
    })

    const imported = importStoryPackage({ package: exported, dryRun: false })
    expect(imported.report.dryRun).toBe(false)
    expect(imported.story?.status).toBe('draft')
    expect(imported.story?.lorebookEntries).toHaveLength(2)
    expect(imported.story?.lorebookEntries[0].sceneIds[0]).toBe(imported.story?.scenes[0].id)

    const unsupported = inspectStoryImport({ format: 'sillytavern.character-card', formatVersion: 3 })
    expect(unsupported.report.canImport).toBe(false)
    expect(unsupported.report.issues[0].code).toBe('UNSUPPORTED_IMPORT_FORMAT')
  })

  it('外部 SillyTavern V2 角色卡可转换为 Storybound 草稿', () => {
    const externalCard = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: '林鸢',
        description: '林鸢是雾港灯塔的守夜人，熟悉所有失踪船只的传闻。',
        personality: '克制、敏锐、回避私人问题。',
        scenario: '玩家在涨潮前抵达雾港灯塔，海面传来失踪船只的汽笛。',
        first_mes: '林鸢合上航海日志，说：“涨潮前不要离开灯塔。”',
        system_prompt: '保持悬疑叙事，不直接解释所有谜团。',
        tags: ['悬疑', '海港'],
        character_book: {
          entries: [
            {
              keys: ['雾港', '潮汐'],
              comment: '潮汐钟',
              content: '潮汐钟会在失踪船只靠近时倒走。',
            },
          ],
        },
      },
    }

    const inspected = inspectStoryImport({ package: externalCard, dryRun: true })
    expect(inspected.report).toMatchObject({
      adapter: 'sillytavern-character',
      format: 'sillytavern.character-card',
      formatVersion: 2,
      canImport: true,
      storyTitle: '林鸢',
      counts: { characters: 1, scenes: 1, lorebookEntries: 1 },
      conversion: { lossy: true },
    })
    expect(inspected.report.issues.some((issue) => issue.code === 'LOSSY_EXTERNAL_IMPORT')).toBe(true)

    const imported = importStoryPackage({ package: externalCard, dryRun: false })
    expect(imported.story?.status).toBe('draft')
    expect(imported.story?.characters[0]).toMatchObject({ name: '林鸢', roleType: 'main' })
    expect(imported.story?.scenes[0].openingMessage).toContain('涨潮前不要离开灯塔')
    expect(imported.story?.lorebookEntries[0]).toMatchObject({
      title: '潮汐钟',
      keywords: ['雾港', '潮汐'],
    })
  })

  it('事实、世界书、命中节点和声明式 MOD 会进入上下文预算', async () => {
    const story = createStructuredStory()
    const abilityId = String(story.abilities[0].id)
    const conversationId = createConversation(String(story.id), {
      title: '结构化上下文存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [abilityId],
    }).id
    const before = activePointers(conversationId)
    useConversationAbility(conversationId, {
      abilityId,
      input: { detail: '拿出旧车票' },
      statePatch: {},
      ...before,
    })
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '观察槐安站的检票口，确认末班车广播',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)

    expect(prompt.system).toContain('结构化事实')
    expect(prompt.system).toContain('秘密事实：沈砚的秘密')
    expect(prompt.system).toContain('召回的世界书资料')
    expect(prompt.system).toContain('三年前事故后的站台广播会在暴雨夜重新播报末班车。')
    expect(prompt.system).toContain('当前可触发故事节点')
    expect(prompt.system).toContain('可触发：检票口开启')
    expect(prompt.system).toContain('声明式 MOD 提示词贡献')
    expect(prompt.contextEstimate.segments.map((segment) => segment.name)).toContain('故事节点')
    expect(prompt.contextEstimate.segments.map((segment) => segment.name)).toContain('世界书资料')
    expect(
      prompt.contextEstimate.promptSnapshot?.blocks.find((block) => block.id === 'story.lorebook.matched'),
    ).toMatchObject({
      source: 'lorebook',
      included: true,
      includedItems: 1,
    })
  })

  it('Lorebook 诊断解释关键词、条件和作用域召回结果', () => {
    const story = createStructuredStory()
    const conversationId = createConversation(String(story.id), {
      title: '世界书诊断存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id

    const diagnostics = getLorebookDiagnostics(conversationId, '槐安站末班车')
    expect(diagnostics.find((item) => item.title === '槐安站事故')).toMatchObject({
      title: '槐安站事故',
      matched: true,
      matchedKeywords: ['槐安站', '末班车'],
      reasons: ['matched'],
    })
    expect(diagnostics.find((item) => item.title === '地下档案室')).toMatchObject({
      matched: false,
      reasons: ['keyword_not_matched'],
    })
  })

  it('召回质量诊断区分背景资料、固定记忆和章节回顾', () => {
    const story = createStructuredStory()
    const conversationId = createConversation(String(story.id), {
      title: '召回质量存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id
    const before = activePointers(conversationId)
    const pinned = togglePinnedMemory(conversationId, {
      messageId: before.expectedLeafMessageId,
      ...before,
    })
    closeChapter(conversationId, {
      title: '事故余波',
      summary: '玩家确认槐安站事故与三年前的末班车有关。',
      expectedLeafMessageId: before.expectedLeafMessageId,
      expectedCheckpointId: pinned.activeCheckpointId,
    })

    const recall = getRecallDiagnostics(conversationId, '槐安站 三年 末班车')
    expect(recall.matchedItems).toBeGreaterThanOrEqual(3)
    expect(recall.engine).toMatchObject({
      active: 'lexical',
      fts5Ready: true,
    })
    expect(recall.engine.sources.map((source) => source.id)).toEqual([
      'lorebook',
      'pinned_memory',
      'long_term_memory',
      'chapter_summary',
    ])
    expect(recall.diagnostics.find((item) => item.source === 'lorebook')).toMatchObject({
      boundary: 'background_lore',
      matched: true,
    })
    expect(recall.diagnostics.find((item) => item.source === 'pinned_memory')).toMatchObject({
      boundary: 'confirmed_memory',
      matched: true,
    })
    expect(recall.diagnostics.find((item) => item.source === 'chapter_summary')).toMatchObject({
      boundary: 'chapter_summary',
      matched: true,
    })

    const miss = getRecallDiagnostics(conversationId, 'zzqv-unmatched baseline')
    const lexicalMemoryMisses = miss.diagnostics.filter((item) => item.source !== 'lorebook')
    expect(lexicalMemoryMisses.every((item) => item.matchedTerms.length === 0)).toBe(true)
    expect(lexicalMemoryMisses.every((item) => !item.matched)).toBe(true)
  })

  it('召回 benchmark 统计固定语料的 Recall@K、漏召和误召回', () => {
    const story = createStructuredStory()
    const conversationId = createConversation(String(story.id), {
      title: '召回 benchmark 存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id
    const before = activePointers(conversationId)
    const pinned = togglePinnedMemory(conversationId, {
      messageId: before.expectedLeafMessageId,
      ...before,
    })
    closeChapter(conversationId, {
      title: '事故余波',
      summary: '玩家确认槐安站事故与三年前的末班车有关。',
      expectedLeafMessageId: before.expectedLeafMessageId,
      expectedCheckpointId: pinned.activeCheckpointId,
    })

    const report = evaluateRecallBenchmark(conversationId, [
      {
        id: 'single-hop-station',
        query: '槐安站 三年 末班车',
        expected: [
          { source: 'lorebook', title: '槐安站事故' },
          { source: 'pinned_memory', title: '固定记忆 1' },
          { source: 'chapter_summary', title: '事故余波' },
        ],
      },
      {
        id: 'no-answer-memory-negative',
        query: 'zzqv-unmatched baseline',
        expected: [],
        ignoredUnexpectedSources: ['lorebook'],
      },
    ])

    expect(report.summary).toMatchObject({
      totalCases: 2,
      expectedCount: 3,
      matchedExpectedCount: 3,
      missedExpectedCount: 0,
      unexpectedMatchCount: 0,
      recallAtK: 1,
    })
    expect(report.cases.every((item) => item.missedExpected.length === 0)).toBe(true)
  })

  it('节点机会池不会把已完成节点继续注入提示词', async () => {
    const story = createStructuredStory()
    const abilityId = String(story.abilities[0].id)
    const nodeId = String(story.nodes[0].id)
    const conversationId = createConversation(String(story.id), {
      title: '节点进度存档',
      sceneId: String(story.scenes[0].id),
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [abilityId],
    }).id
    const before = activePointers(conversationId)
    const used = useConversationAbility(conversationId, {
      abilityId,
      input: { detail: '拿出旧车票' },
      statePatch: {},
      ...before,
    })
    const stateRow = db
      .query<{ state_json: string }, [string]>('SELECT state_json FROM runtime_checkpoints WHERE id = ?')
      .get(used.activeCheckpointId)!
    const state = JSON.parse(stateRow.state_json) as Record<string, any>
    state.custom = {
      ...(state.custom || {}),
      nodeProgress: { [nodeId]: { status: 'completed', updatedAt: '2026-08-17T00:00:00.000Z' } },
    }
    db.query('UPDATE runtime_checkpoints SET state_json = ? WHERE id = ?').run(
      JSON.stringify(state),
      used.activeCheckpointId,
    )
    db.query('UPDATE conversations SET state_json = ? WHERE id = ?').run(JSON.stringify(state), conversationId)

    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: before.expectedLeafMessageId,
      content: '继续观察检票口',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    expect(prompt.system).toContain('节点进度：检票口开启 已完成')
    expect(prompt.system).not.toContain('当前可触发故事节点')
    expect(
      prompt.contextEstimate.promptSnapshot?.blocks.find((block) => block.id === 'story.nodes.matched'),
    ).toMatchObject({
      included: false,
      reason: 'condition_not_matched',
    })
  })

  it('拒绝不安全或不匹配的动态状态 Schema', () => {
    const draft = duplicateStory('story-rain-terminal')
    expect(() =>
      updateStoryDraft(
        String(draft.id),
        storyDraftSchema.parse({
          ...draft,
          stateSchema: { type: 'object', properties: {}, additionalProperties: true },
        }),
      ),
    ).toThrow('additionalProperties')

    expect(() =>
      updateStoryDraft(
        String(draft.id),
        storyDraftSchema.parse({
          ...draft,
          stateSchema: {
            type: 'object',
            properties: { sanity: { type: 'integer', minimum: 0, maximum: 100 } },
            required: ['sanity'],
            additionalProperties: false,
          },
          defaultState: { sanity: 200 },
        }),
      ),
    ).toThrow('默认自定义状态')
  })
})
