import { beforeEach, describe, expect, it } from 'bun:test'

const { db } = await import('../src/db/connection')
const { initializeCurrentSchema } = await import('../src/db/schema')
const { seedBuiltInStories } = await import('../src/db/seed')
const { seedDefaultModelProvider } = await import('../src/repositories/modelProviders')
const { createConversation } = await import('../src/services/conversationService')
const { createStateSuggestion } = await import('../src/services/conversationManagementService')
const { prepareSend } = await import('../src/services/generationService')
const { buildModelMessages } = await import('../src/services/promptBuilder')
const { getConversationView } = await import('../src/repositories/conversations')
const { listRuntimeMods, startTrustedMods, updateConversationMod, updateRuntimeMod } = await import(
  '../src/services/modService'
)
const { narrativePreferencesSchema } = await import('../src/domain/schemas')

initializeCurrentSchema(db)
seedDefaultModelProvider()
seedBuiltInStories(db)
await startTrustedMods()

function createTestConversation() {
  return createConversation('story-rain-terminal', {
    title: 'MOD 测试存档',
    sceneId: 'scene-rain-platform',
    player: { name: '测试玩家', pronouns: '不限定', note: '' },
    abilityIds: [],
  }).id
}

beforeEach(() => {
  db.exec(`
    DELETE FROM operation_receipts;
    DELETE FROM generations;
    DELETE FROM conversation_events;
    DELETE FROM conversation_mods;
    DELETE FROM runtime_checkpoints;
    DELETE FROM messages;
    DELETE FROM chapters;
    DELETE FROM conversations;
  `)
})

describe('故事 MOD 运行时', () => {
  it('加载受信任 MOD 并暴露 Fiber 诊断', () => {
    const mods = listRuntimeMods()
    expect(mods).toHaveLength(4)
    expect(mods.every((mod) => mod.enabled && mod.runtime.loaded && mod.runtime.state === 'active')).toBe(true)
    expect(mods.every((mod) => mod.runtime.effectCount > 0)).toBe(true)
  })

  it('为新存档原子写入默认叙事方式', () => {
    const conversationId = createTestConversation()
    const conversation = db
      .query('SELECT mod_snapshot_json, active_checkpoint_id FROM conversations WHERE id = ?')
      .get(conversationId) as { mod_snapshot_json: string; active_checkpoint_id: string }
    const checkpoint = db
      .query('SELECT mod_snapshot_json FROM runtime_checkpoints WHERE id = ?')
      .get(conversation.active_checkpoint_id) as { mod_snapshot_json: string }
    const row = db
      .query('SELECT enabled, config_json FROM conversation_mods WHERE conversation_id = ? AND mod_id = ?')
      .get(conversationId, 'narrative-perspective') as { enabled: number; config_json: string }

    const expected = {
      perspective: 'second_player',
      viewpointCharacterId: null,
      tense: 'present',
      length: 'balanced',
      targetWords: 800,
      dialogueDensity: 'balanced',
    }
    expect(JSON.parse(conversation.mod_snapshot_json)['narrative-perspective'].config).toEqual(expected)
    expect(JSON.parse(checkpoint.mod_snapshot_json)).toEqual(JSON.parse(conversation.mod_snapshot_json))
    expect(row.enabled).toBe(1)
    expect(JSON.parse(row.config_json)).toEqual(expected)
  })

  it('把指定人物视角、时态、篇幅和对白密度加入提示词', async () => {
    const conversationId = createConversation('story-rain-terminal', {
      title: '人物视角存档',
      sceneId: 'scene-rain-platform',
      player: { name: '测试玩家', pronouns: '不限定', note: '' },
      abilityIds: [],
      narrative: {
        perspective: 'first_character',
        viewpointCharacterId: 'char-shen-yan',
        tense: 'past',
        length: 'expanded',
        targetWords: 1200,
        dialogueDensity: 'high',
      },
    }).id
    const conversation = getConversationView(conversationId)!
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(conversation.activeLeafMessageId),
      content: '观察列车里的情况',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(
      conversationId,
      prepared.playerMessageId,
      String(conversation.activeCheckpointId),
    )

    expect(prompt.system).toContain('[MOD · 叙事方式]')
    expect(prompt.system).toContain('由“沈砚”作为第一人称叙述者')
    expect(prompt.system).toContain('玩家“测试玩家”仍是行动决策者')
    expect(prompt.system).toContain('过去时态')
    expect(prompt.system).toContain('五到八段')
    expect(prompt.system).toContain('目标约 1200 字')
    expect(prompt.system).toContain('优先用有来有往的对白')
  })

  it('拒绝缺少或不属于故事的人物视角', () => {
    expect(() => narrativePreferencesSchema.parse({ perspective: 'first_character' })).toThrow(
      '人物视角需要选择一个故事人物',
    )
    expect(() =>
      createConversation('story-rain-terminal', {
        title: '无效人物视角',
        sceneId: 'scene-rain-platform',
        player: { name: '测试玩家', pronouns: '不限定', note: '' },
        abilityIds: [],
        narrative: {
          perspective: 'third_character',
          viewpointCharacterId: 'char-from-another-story',
          tense: 'present',
          length: 'balanced',
          targetWords: 800,
          dialogueDensity: 'balanced',
        },
      }),
    ).toThrow('视角人物不属于当前故事')
  })

  it('切换叙事方式创建检查点并保留旧快照', async () => {
    const conversationId = createTestConversation()
    const before = getConversationView(conversationId)!
    const changed = updateConversationMod(conversationId, 'narrative-perspective', {
      enabled: true,
      config: {
        perspective: 'first_player',
        viewpointCharacterId: null,
        tense: 'present',
        length: 'compact',
        targetWords: 600,
        dialogueDensity: 'low',
      },
      expectedLeafMessageId: String(before.activeLeafMessageId),
      expectedCheckpointId: String(before.activeCheckpointId),
    })
    const after = getConversationView(conversationId)!
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(after.activeLeafMessageId),
      content: '继续调查',
      inputMode: 'action',
    })
    const oldPrompt = await buildModelMessages(
      conversationId,
      prepared.playerMessageId,
      String(before.activeCheckpointId),
    )
    const newPrompt = await buildModelMessages(conversationId, prepared.playerMessageId, changed.activeCheckpointId)

    expect(changed.activeCheckpointId).not.toBe(before.activeCheckpointId)
    expect(changed.event?.kind).toBe('mod_configured')
    expect(oldPrompt.system).toContain('使用“你”称呼玩家')
    expect(oldPrompt.system).not.toContain('使用“我”描述玩家已经明确做出的行动')
    expect(newPrompt.system).toContain('使用“我”描述玩家已经明确做出的行动')
    expect(newPrompt.system).toContain('二到三段')
    expect(newPrompt.system).toContain('目标约 600 字')
  })

  it('全局默认不接受依赖具体故事的人物视角', async () => {
    await expect(
      updateRuntimeMod('narrative-perspective', {
        defaultConfig: {
          perspective: 'first_character',
          viewpointCharacterId: 'char-shen-yan',
          tense: 'present',
          length: 'balanced',
          targetWords: 800,
          dialogueDensity: 'balanced',
        },
      }),
    ).rejects.toThrow('指定人物视角需要在具体故事存档中设置')
  })

  it('在故事中启用 MOD 时创建检查点和可见事件，只影响新快照', async () => {
    const conversationId = createTestConversation()
    const before = getConversationView(conversationId)!
    const changed = updateConversationMod(conversationId, 'continuity-guard', {
      enabled: true,
      config: { strictness: 'strict', protectPlayerAgency: true },
      expectedLeafMessageId: String(before.activeLeafMessageId),
      expectedCheckpointId: String(before.activeCheckpointId),
    })

    expect(changed.activeCheckpointId).not.toBe(before.activeCheckpointId)
    expect(changed.event?.kind).toBe('mod_enabled')
    expect(
      db.query('SELECT parent_checkpoint_id FROM runtime_checkpoints WHERE id = ?').get(changed.activeCheckpointId),
    ).toEqual({ parent_checkpoint_id: before.activeCheckpointId })

    const after = getConversationView(conversationId)!
    expect(after.events).toHaveLength(1)
    const baselineState = { phase: '玩家消息基线', scene: { location: '旧站台' } }
    db.query('UPDATE runtime_checkpoints SET state_json = ? WHERE id = ?').run(
      JSON.stringify(baselineState),
      changed.activeCheckpointId,
    )
    db.query('UPDATE conversations SET state_json = ? WHERE id = ?').run(
      JSON.stringify({ phase: '不应进入提示词', scene: { location: '错误现场' } }),
      conversationId,
    )
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(after.activeLeafMessageId),
      content: '沿着站台继续检查',
      inputMode: 'action',
    })
    const currentPrompt = await buildModelMessages(conversationId, prepared.playerMessageId, changed.activeCheckpointId)
    expect(currentPrompt.system).toContain('[MOD · 连续性守门]')
    expect(currentPrompt.contributions[0]).toMatchObject({ modId: 'continuity-guard', included: true, required: true })
    expect(currentPrompt.system).toContain('玩家消息基线')
    expect(currentPrompt.system).not.toContain('不应进入提示词')

    const oldPrompt = await buildModelMessages(
      conversationId,
      prepared.playerMessageId,
      String(before.activeCheckpointId),
    )
    expect(oldPrompt.system).not.toContain('[MOD · 连续性守门]')
  })

  it('生成期间拒绝修改 MOD', () => {
    const conversationId = createTestConversation()
    const conversation = getConversationView(conversationId)!
    prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(conversation.activeLeafMessageId),
      content: '开始生成',
      inputMode: 'action',
    })
    const duringGeneration = getConversationView(conversationId)!
    expect(() =>
      updateConversationMod(conversationId, 'narrative-style', {
        enabled: true,
        config: { style: 'literary', sensoryDetail: true },
        expectedLeafMessageId: String(duringGeneration.activeLeafMessageId),
        expectedCheckpointId: String(duringGeneration.activeCheckpointId),
      }),
    ).toThrow('生成回复时不能修改 MOD')
  })

  it('节奏导演会根据当前检查点动态调整提示词', async () => {
    const conversationId = createTestConversation()
    const before = getConversationView(conversationId)!
    const enabled = updateConversationMod(conversationId, 'pacing-director', {
      enabled: true,
      config: { pace: 'balanced', endingHook: false },
      expectedLeafMessageId: String(before.activeLeafMessageId),
      expectedCheckpointId: String(before.activeCheckpointId),
    })
    createStateSuggestion(conversationId, {
      title: '站台气氛变化',
      summary: '模型建议让站台压力上升，但还没有被用户确认。',
      patch: {},
      source: 'model',
      expectedLeafMessageId: String(before.activeLeafMessageId),
      expectedCheckpointId: enabled.activeCheckpointId,
    })
    const prepared = prepareSend(conversationId, {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: String(before.activeLeafMessageId),
      content: '继续观察站台',
      inputMode: 'action',
    })
    const prompt = await buildModelMessages(conversationId, prepared.playerMessageId)

    expect(prompt.system).toContain('[MOD · 节奏导演]')
    expect(prompt.system).toContain('当前有 1 条待确认状态建议')
    expect(prompt.contributions.find((item) => item.modId === 'pacing-director')).toMatchObject({
      section: 'director',
      included: true,
    })
  })

  it('有存档使用时阻止从全局运行时卸载', async () => {
    const conversationId = createTestConversation()
    const conversation = getConversationView(conversationId)!
    updateConversationMod(conversationId, 'pacing-director', {
      enabled: true,
      config: { pace: 'fast', endingHook: true },
      expectedLeafMessageId: String(conversation.activeLeafMessageId),
      expectedCheckpointId: String(conversation.activeCheckpointId),
    })
    expect(updateRuntimeMod('pacing-director', { enabled: false })).rejects.toThrow('仍有存档启用了这个 MOD')
  })
})
