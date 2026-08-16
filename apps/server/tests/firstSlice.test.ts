import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const streamModelMock = mock(() =>
  (async function* () {
    yield { type: 'text' as const, text: '默认回复' }
    yield { type: 'finish' as const, reason: 'stop' }
  })(),
)

const { db } = await import('../src/db/connection')
const { initializeCurrentSchema } = await import('../src/db/schema')
const { seedBuiltInStories } = await import('../src/db/seed')
const { seedDefaultModelProvider } = await import('../src/repositories/modelProviders')
const { createConversation } = await import('../src/services/conversationService')
const { prepareRegenerate, prepareSend, resetModelStreamImplementation, runGeneration, setModelStreamImplementation } =
  await import('../src/services/generationService')
const { buildModelMessages } = await import('../src/services/promptBuilder')
const { getConversationView, getCurrentPathPage } = await import('../src/repositories/conversations')
const { getStory } = await import('../src/repositories/stories')
const { selectReplyCandidate } = await import('../src/services/conversationManagementService')
const { deleteStoryDraft, duplicateStory, publishStory } = await import('../src/services/storyEditorService')
const {
  createModelProvider,
  deleteModelProvider,
  getDefaultProviderSnapshot,
  getProviderCredential,
  updateModelProvider,
} = await import('../src/repositories/modelProviders')
const { getStoryboundRuntimeStatus, installStoryboundPlugin } = await import('../src/runtime/storyboundRuntime')

function createTestConversation(title = '测试存档') {
  return createConversation('story-rain-terminal', {
    title,
    sceneId: 'scene-rain-platform',
    player: { name: '测试玩家', pronouns: '不限定', note: '' },
    abilityIds: ['ability-observe'],
  }).id
}

function successfulStream(content: string) {
  return (async function* () {
    yield { type: 'text' as const, text: content }
    yield { type: 'finish' as const, reason: 'stop' }
  })()
}

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
  streamModelMock.mockReset()
  setModelStreamImplementation(streamModelMock as Parameters<typeof setModelStreamImplementation>[0])
})

afterAll(() => resetModelStreamImplementation())

describe('第一阶段故事链路', () => {
  it('在一个事务中创建完整存档、章节、开场和检查点', () => {
    const conversationId = createTestConversation()
    const conversation = getConversationView(conversationId)
    expect(conversation?.messages).toHaveLength(1)
    expect(conversation?.activeLeafMessageId).toBe(conversation?.messages[0].id)
    expect(db.query('SELECT tree_depth FROM messages WHERE id = ?').get(conversation?.messages[0].id)).toEqual({
      tree_depth: 0,
    })
    expect(db.query('SELECT COUNT(*) AS count FROM chapters WHERE conversation_id = ?').get(conversationId)).toEqual({
      count: 1,
    })
    expect(
      db.query('SELECT COUNT(*) AS count FROM runtime_checkpoints WHERE conversation_id = ?').get(conversationId),
    ).toEqual({ count: 1 })
  })

  it('只把当前玩家输入加入模型上下文一次', async () => {
    const conversationId = createTestConversation()
    const leaf = String(getConversationView(conversationId)?.activeLeafMessageId)
    const uniqueInput = 'UNIQUE_PLAYER_INPUT_7F4A'
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: leaf,
      content: uniqueInput,
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)
    const serialized = `${prompt.system}\n${prompt.messages.map((message) => message.content).join('\n')}`
    expect(serialized.split(uniqueInput)).toHaveLength(2)
    expect(prompt.system).toContain('沈砚')
    expect(prompt.system).not.toContain('周师傅')
    expect(prompt.contextEstimate.estimatedTokens).toBeLessThanOrEqual(prompt.contextEstimate.requestBudget)
  })

  it('把历史玩家输入模式写入模型上下文', async () => {
    streamModelMock.mockReturnValueOnce(successfulStream('沈砚看向被雨水泡胀的站牌。'))
    const conversationId = createTestConversation()
    const first = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(getConversationView(conversationId)?.activeLeafMessageId),
      content: '检查站牌',
      inputMode: 'action',
    })
    await runGeneration(first, () => undefined)

    const second = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(getConversationView(conversationId)?.activeLeafMessageId),
      content: '三天后，暴雨还没有停。',
      inputMode: 'narration',
    })
    const prompt = await buildModelMessages(conversationId, second.playerMessageId)

    expect(
      prompt.messages.some((message) => message.role === 'user' && message.content.includes('[玩家行动]\n检查站牌')),
    ).toBe(true)
    expect(prompt.messages.at(-1)?.content).toContain('[玩家旁白]\n三天后，暴雨还没有停。')
  })

  it('Cordis 插件可以扩展提示词并在卸载时自动清理', async () => {
    const fiber = await installStoryboundPlugin({
      name: 'test-prompt-extension',
      inject: ['storybound'],
      apply(ctx) {
        ctx.on('storybound/prompt/assemble', async (_request, next) => {
          const prompt = await next()
          return { ...prompt, system: `${prompt.system}\n\n[TEST_EXTENSION]` }
        })
      },
    })
    const conversationId = createTestConversation()
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(getConversationView(conversationId)?.activeLeafMessageId),
      content: '检查扩展点',
      inputMode: 'action',
    })
    expect((await buildModelMessages(conversationId, prepared.playerMessageId)).system).toContain('[TEST_EXTENSION]')
    expect((await getStoryboundRuntimeStatus()).plugins.some((plugin) => plugin.name === 'test-prompt-extension')).toBe(
      true,
    )

    await fiber.dispose()
    expect((await buildModelMessages(conversationId, prepared.playerMessageId)).system).not.toContain(
      '[TEST_EXTENSION]',
    )
    expect((await getStoryboundRuntimeStatus()).plugins.some((plugin) => plugin.name === 'test-prompt-extension')).toBe(
      false,
    )
  })

  it('按 conversation_id 隔离两个独立存档', () => {
    const firstId = createTestConversation('存档 A')
    const secondId = createTestConversation('存档 B')
    const firstLeaf = String(getConversationView(firstId)?.activeLeafMessageId)
    prepareSend(firstId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: firstLeaf,
      content: '只属于 A 的行动',
      inputMode: 'action',
    })
    expect(getConversationView(firstId)?.messages).toHaveLength(2)
    expect(getConversationView(secondId)?.messages).toHaveLength(1)
    expect(
      getConversationView(secondId)?.messages.some((message) => String(message.content).includes('只属于 A')),
    ).toBe(false)
  })

  it('重复 clientMessageId 不会重复写入玩家消息或生成任务', () => {
    const conversationId = createTestConversation()
    const leaf = String(getConversationView(conversationId)?.activeLeafMessageId)
    const clientMessageId = crypto.randomUUID()
    const input = { clientMessageId, expectedLeafMessageId: leaf, content: '检查站牌', inputMode: 'action' as const }
    const first = prepareSend(conversationId, input)
    const second = prepareSend(conversationId, input)
    expect(second.id).toBe(first.id)
    expect(second.duplicate).toBe(true)
    expect(
      db
        .query("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND sender = 'player'")
        .get(conversationId),
    ).toEqual({ count: 1 })
    expect(db.query('SELECT COUNT(*) AS count FROM generations WHERE conversation_id = ?').get(conversationId)).toEqual(
      { count: 1 },
    )
  })

  it('模型失败时保留已保存的玩家消息并允许后续重试', async () => {
    streamModelMock.mockImplementation(() =>
      (async function* () {
        throw new Error('connection refused')
      })(),
    )
    const conversationId = createTestConversation()
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(getConversationView(conversationId)?.activeLeafMessageId),
      content: '走进车厢',
      inputMode: 'action',
    })
    await runGeneration(prepared, () => undefined)
    const conversation = getConversationView(conversationId)
    expect(conversation?.messages.at(-1)?.content).toBe('走进车厢')
    expect(conversation?.messages.at(-1)?.sender).toBe('player')
    expect(db.query('SELECT status, error_code FROM generations WHERE id = ?').get(prepared.id)).toEqual({
      status: 'failed',
      error_code: 'MODEL_UNAVAILABLE',
    })
  })

  it('重新生成创建兄弟版本并保留原人物回复', async () => {
    streamModelMock.mockReturnValueOnce(successfulStream('第一版人物回复'))
    const conversationId = createTestConversation()
    const first = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(getConversationView(conversationId)?.activeLeafMessageId),
      content: '询问末班车去向',
      inputMode: 'dialogue',
    })
    await runGeneration(first, () => undefined)
    const firstReply = getConversationView(conversationId)?.messages.at(-1)

    streamModelMock.mockReturnValueOnce(successfulStream('第二版人物回复'))
    const regenerated = prepareRegenerate(conversationId, {
      operationId: crypto.randomUUID(),
      expectedLeafMessageId: String(firstReply?.id),
    })
    await runGeneration(regenerated, () => undefined)

    const siblings = db
      .query('SELECT id, parent_message_id, content FROM messages WHERE generation_id IN (?, ?) ORDER BY created_at')
      .all(first.id, regenerated.id) as Array<{ id: string; parent_message_id: string; content: string }>
    expect(siblings.map((message) => message.content).sort()).toEqual(['第一版人物回复', '第二版人物回复'].sort())
    expect(siblings[0].parent_message_id).toBe(siblings[1].parent_message_id)
    const afterRegenerate = getConversationView(conversationId)!
    expect(afterRegenerate.messages.at(-1)?.content).toBe('第二版人物回复')
    expect(afterRegenerate.replyCandidates.map((candidate) => candidate.message.content)).toEqual([
      '第一版人物回复',
      '第二版人物回复',
    ])
    expect(afterRegenerate.replyCandidates.map((candidate) => candidate.isActive)).toEqual([false, true])
    expect(db.query('SELECT tree_depth FROM messages WHERE generation_id = ?').get(regenerated.id)).toEqual({
      tree_depth: 2,
    })

    const firstCandidate = afterRegenerate.replyCandidates[0]
    const selected = selectReplyCandidate(conversationId, {
      messageId: String(firstCandidate.message.id),
      expectedLeafMessageId: String(afterRegenerate.activeLeafMessageId),
      expectedCheckpointId: String(afterRegenerate.activeCheckpointId),
    })
    expect(selected.activeLeafMessageId).toBe(firstCandidate.message.id)
    expect(selected.activeCheckpointId).toBe(firstCandidate.checkpointId)
    const afterSelect = getConversationView(conversationId)!
    expect(afterSelect.messages.at(-1)?.content).toBe('第一版人物回复')
    expect(afterSelect.activeCheckpointId).toBe(firstCandidate.checkpointId)
  })

  it('思考内容不进入故事正文，并保存 usage 与请求遥测', async () => {
    streamModelMock.mockImplementationOnce(() =>
      (async function* () {
        yield { type: 'metadata' as const, requestId: 'request-telemetry-1' }
        yield { type: 'reasoning' as const, text: '这段推理不能出现在故事里' }
        yield { type: 'text' as const, text: '她推开了候车室的门。' }
        yield {
          type: 'usage' as const,
          usage: { inputTokens: 120, outputTokens: 24, cacheReadTokens: 80, reasoningTokens: 10 },
        }
        yield { type: 'finish' as const, reason: 'stop' }
      })(),
    )
    const conversationId = createTestConversation()
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(getConversationView(conversationId)?.activeLeafMessageId),
      content: '推门进去',
      inputMode: 'action',
    })
    await runGeneration(prepared, () => undefined)
    expect(getConversationView(conversationId)?.messages.at(-1)?.content).toBe('她推开了候车室的门。')
    expect(
      db
        .query(`
      SELECT provider_request_id, input_tokens, output_tokens, cache_read_tokens, reasoning_tokens, finish_reason
      FROM generations WHERE id = ?
    `)
        .get(prepared.id),
    ).toEqual({
      provider_request_id: 'request-telemetry-1',
      input_tokens: 120,
      output_tokens: 24,
      cache_read_tokens: 80,
      reasoning_tokens: 10,
      finish_reason: 'stop',
    })
    const contextRow = db
      .query<{ context_estimate_json: string }, [string]>('SELECT context_estimate_json FROM generations WHERE id = ?')
      .get(prepared.id)!
    const contextEstimate = JSON.parse(contextRow.context_estimate_json) as {
      estimatedTokens: number
      calibration?: { actualInputTokens: number; estimateErrorTokens: number }
    }
    expect(contextEstimate.calibration?.actualInputTokens).toBe(120)
    expect(contextEstimate.calibration?.estimateErrorTokens).toBe(120 - contextEstimate.estimatedTokens)
  })

  it('复制内置故事为可编辑草稿，并在体检通过后发布', () => {
    const copy = duplicateStory('story-rain-terminal')
    expect(copy.isBuiltin).toBe(false)
    expect(copy.status).toBe('draft')
    expect(copy.characters[0].id).not.toBe('character-lin')
    const published = publishStory(String(copy.id))
    expect(published.story.status).toBe('active')
    expect(published.issues.some((issue) => issue.severity === 'error')).toBe(false)
  })

  it('删除未关联存档的草稿并从故事库隐藏', () => {
    const copy = duplicateStory('story-rain-terminal')
    deleteStoryDraft(String(copy.id))
    expect(getStory(String(copy.id), true)).toBeNull()
    expect(db.query('SELECT status FROM story_cards WHERE id = ?').get(String(copy.id))).toEqual({ status: 'trashed' })
  })

  it('轮换密钥时保留旧对话快照引用的凭据版本', () => {
    const before = getDefaultProviderSnapshot()
    const oldKey = getProviderCredential(before.credentialRef)
    updateModelProvider(before.providerId, { apiKey: 'rotated-test-key' })
    const after = getDefaultProviderSnapshot()
    expect(after.credentialRef).not.toBe(before.credentialRef)
    expect(getProviderCredential(before.credentialRef)).toBe(oldKey)
    expect(getProviderCredential(after.credentialRef)).toBe('rotated-test-key')
  })

  it('删除未被引用的非默认 Provider 时正确报告成功', () => {
    const provider = createModelProvider({
      name: '临时 Provider',
      kind: 'local',
      baseUrl: 'http://127.0.0.1:9999/v1',
      apiKey: '',
      defaultModel: 'test-model',
      contextWindow: 8192,
      maxOutputTokens: 512,
      thinkingMode: 'off',
      thinkingEffort: null,
    })
    expect(deleteModelProvider(provider.id)).toBe(true)
  })

  it('新建存档使用用户选择的 Provider 快照', () => {
    const provider = createModelProvider({
      name: '远端替身',
      kind: 'local',
      baseUrl: 'http://127.0.0.1:9998/v1',
      apiKey: 'snapshot-key',
      defaultModel: 'story-model',
      contextWindow: 16384,
      maxOutputTokens: 1024,
      thinkingMode: 'on',
      thinkingEffort: 'high',
    })
    const conversationId = createConversation('story-rain-terminal', {
      title: '指定模型存档',
      sceneId: 'scene-rain-platform',
      providerId: provider.id,
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
    }).id
    const row = db.query('SELECT model_config_json FROM conversations WHERE id = ?').get(conversationId) as {
      model_config_json: string
    }
    const snapshot = JSON.parse(row.model_config_json)
    expect(snapshot).toMatchObject({
      providerId: provider.id,
      model: 'story-model',
      thinkingMode: 'on',
      thinkingEffort: 'high',
    })
    expect(snapshot.credentialRef).toBeTruthy()
    db.query('DELETE FROM conversations WHERE id = ?').run(conversationId)
    expect(deleteModelProvider(provider.id)).toBe(true)
  })

  it('使用游标分页读取长对话且不重复消息', () => {
    const conversationId = createTestConversation()
    const conversation = getConversationView(conversationId)!
    const chapterId = conversation.messages[0].chapterId
    let parentId = conversation.messages[0].id
    for (let index = 1; index <= 95; index += 1) {
      const id = crypto.randomUUID()
      db.query(`
        INSERT INTO messages (id, conversation_id, chapter_id, parent_message_id, sender, content, tree_depth, created_at)
        VALUES (?, ?, ?, ?, 'narrator', ?, ?, ?)
      `).run(
        id,
        conversationId,
        chapterId,
        parentId,
        `分页消息 ${index}`,
        index,
        new Date(1_700_000_000_000 + index).toISOString(),
      )
      parentId = id
    }
    db.query('UPDATE conversations SET active_leaf_message_id = ? WHERE id = ?').run(parentId, conversationId)
    const latest = getCurrentPathPage(conversationId, { limit: 80 })
    const older = getCurrentPathPage(conversationId, { before: latest.nextCursor!, limit: 80 })
    expect(latest.rows).toHaveLength(80)
    expect(latest.hasMore).toBe(true)
    expect(older.rows).toHaveLength(16)
    expect(older.hasMore).toBe(false)
    expect(new Set([...latest.rows, ...older.rows].map((row) => row.id)).size).toBe(96)
  })
})
