import type { Database } from 'bun:sqlite'
import { defaultCustomStateSchema } from '@storybound/shared/schemas'

const builtInStories = [
  {
    id: 'story-rain-terminal',
    title: '雨夜终站',
    cover: '/covers/rain-terminal.png',
    summary: '末班车抵达一座不在时刻表上的车站，而失踪者的声音从旧广播里传来。',
    description:
      '一场持续七天的暴雨切断了旧城区。你追查一宗三年前的失踪案，唯一的新线索把你带到已经停运的槐安站。午夜过后，站台灯逐盏亮起，一列没有编号的列车缓慢进站。',
    background:
      '槐安站于三年前因山体滑坡停运。官方记录称事故当晚无人伤亡，但附近居民始终相信有人被留在了隧道里。暴雨让封闭区域重新出现了电力，旧广播也开始重复播送早已取消的班次。',
    worldRules:
      '故事保持现实悬疑基调。超自然现象可以存在，但需要通过线索逐步显现。人物不会无缘无故信任玩家，重要答案必须通过调查和选择获得。',
    warnings: ['失踪', '幽闭空间', '轻度惊悚'],
    boundaries: ['不描写露骨伤害', '不替玩家决定关键行动'],
    tags: ['悬疑', '都市', '雨夜'],
    player: {
      id: 'player-template-rain',
      roleName: '失踪案调查员',
      background: '你一直没有放弃三年前的失踪案，并收到一盘写着自己名字的旧磁带。',
      goals: '查明失踪者的下落，并决定是否公开槐安站的真相。',
      defaults: { name: '林舟', pronouns: '不限定', note: '' },
    },
    characters: [
      {
        id: 'char-shen-yan',
        name: '沈砚',
        roleType: 'main',
        identity: '自称是末班车乘务员的年轻人',
        appearance: '黑色旧制服，袖口有被雨水浸透的痕迹。',
        personality: '克制、敏锐，对时间异常执着；面对旧事会短暂失去冷静。',
        speech: '句子简短，很少直接回答问题，常用列车运行术语。',
        goals: '让列车完成三年前未完成的最后一次停靠。',
        knowledge: '知道事故当晚列车内发生的事，但不知道站外三年间的调查结果。',
      },
      {
        id: 'char-station-master',
        name: '周师傅',
        roleType: 'supporting',
        identity: '槐安站最后一任值班员',
        appearance: '穿旧雨衣，随身携带一串早已失效的站房钥匙。',
        personality: '谨慎、愧疚，习惯先观察再开口。',
        speech: '带本地方言，谈到事故时会反复确认门窗是否关好。',
        goals: '阻止任何人再次进入隧道，同时掩盖自己当年的一次错误操作。',
        knowledge: '了解车站设施和官方事故记录，对列车内部情况只有猜测。',
      },
    ],
    abilities: [
      {
        id: 'ability-observe',
        name: '细节观察',
        description: '更容易发现环境中被忽略的痕迹。',
        prompt: '当玩家主动调查环境时，提供一项具体且可继续追查的细节。',
      },
      {
        id: 'ability-old-city',
        name: '旧城人脉',
        description: '可以回忆或联系与旧城区有关的人。',
        prompt: '允许玩家合理获得一条来自旧城居民的背景信息，但不能直接给出谜底。',
      },
    ],
    scene: {
      id: 'scene-rain-platform',
      title: '停运站台',
      description: '雨水越过顶棚边缘，站牌后的电子钟停在 00:17。',
      location: '槐安站二号站台',
      time: '暴雨夜，午夜 00:17',
      participants: ['char-shen-yan'],
      entryMethod: '循着旧广播和磁带中的暗号进入封闭车站。',
      opening:
        '列车没有鸣笛。车门在你面前滑开，穿旧制服的年轻人站在暖黄色灯光里，像是已经等了很久。\n\n“林舟，”他准确叫出你的名字，“你比时刻表晚了三年。”',
      openingSender: 'character',
      openingCharacterId: 'char-shen-yan',
      state: {
        phase: '抵达',
        scene: { location: '槐安站二号站台', time: '暴雨夜，午夜 00:17', participantIds: ['char-shen-yan'] },
        custom: {},
      },
    },
  },
  {
    id: 'story-mist-lighthouse',
    title: '雾海灯塔',
    cover: '/covers/mist-lighthouse.png',
    summary: '孤岛灯塔熄灭后的第九个小时，你收到了一段来自二十年前沉船的求救信号。',
    description:
      '北岬灯塔从未熄灭过，直到今晚。你受命乘补给船登岛调查，却在浓雾中听见无线电反复呼叫一艘二十年前已经沉没的科考船。岛上三个人各自掌握着一部分真相。',
    background:
      '北岬岛远离主航线，灯塔由三人轮值维护。二十年前，科考船“远辰号”在附近失踪，残骸从未被发现。岛上的旧气象站仍保留着事故前最后七十二小时的观测纸带。',
    worldRules:
      '故事强调孤立环境中的关系和选择。海况、潮汐和无线电有一致规则。谜团可以带有无法完全解释的部分，但所有关键选择都应有可理解的后果。',
    warnings: ['海难', '孤立环境', '哀伤'],
    boundaries: ['不描写露骨伤害', '不强迫玩家接受超自然解释'],
    tags: ['海洋', '悬疑', '孤岛'],
    player: {
      id: 'player-template-lighthouse',
      roleName: '海事调查员',
      background: '你负责确认灯塔故障是否会威胁附近航线，并记录岛上人员的证词。',
      goals: '恢复灯塔、查明求救信号来源，并让岛上所有人安全离开。',
      defaults: { name: '程雾', pronouns: '不限定', note: '' },
    },
    characters: [
      {
        id: 'char-lin-che',
        name: '林澈',
        roleType: 'main',
        identity: '北岬灯塔代理守塔人',
        appearance: '浅色工作服沾着机油，左手一直握着一枚黄铜哨。',
        personality: '冷静、务实，习惯独自承担责任，对无线电信号明显不安。',
        speech: '表达准确，偶尔用天气现象代替情绪描述。',
        goals: '在下一次涨潮前修复主灯，并阻止调查员打开封存的地下机房。',
        knowledge: '熟悉灯塔机械结构，知道前任守塔人与远辰号的联系。',
      },
      {
        id: 'char-qiao-yu',
        name: '乔屿',
        roleType: 'supporting',
        identity: '驻岛气象员',
        appearance: '戴圆框眼镜，口袋里塞满记录纸和削短的铅笔。',
        personality: '好奇、固执，相信任何异常都应该留下可重复的观测。',
        speech: '语速很快，会准确报出风速、气压和时间。',
        goals: '证明求救信号与异常潮汐存在关联。',
        knowledge: '掌握近年的气象数据，但不知道灯塔地下结构。',
      },
    ],
    abilities: [
      {
        id: 'ability-radio',
        name: '无线电测向',
        description: '根据信号强弱和时间差判断大致来源。',
        prompt: '涉及无线电时给出可核对的方向、频率或时间线索，不直接揭示信号真相。',
      },
      {
        id: 'ability-tide',
        name: '潮汐直觉',
        description: '熟悉海况变化与岛屿地形。',
        prompt: '在移动或判断风险时提示一次与潮汐相关的机会或危险。',
      },
    ],
    scene: {
      id: 'scene-lighthouse-landing',
      title: '熄灭的主灯',
      description: '补给船刚离岸，浓雾便吞没了码头尽头。',
      location: '北岬灯塔底层机房',
      time: '秋季风暴前夜，21:40',
      participants: ['char-lin-che'],
      entryMethod: '乘最后一班补给船登岛，跟随守塔人进入停电机房。',
      opening:
        '主灯的巨大透镜停在黑暗中，只有应急灯照亮齿轮边缘。林澈合上配电箱，抬头看向你。\n\n“线路没有烧毁。”她把一枚断掉的保险片放在桌面上，“是有人在九小时前，手动关掉了灯。”',
      openingSender: 'character',
      openingCharacterId: 'char-lin-che',
      state: {
        phase: '登岛',
        scene: { location: '北岬灯塔底层机房', time: '秋季风暴前夜，21:40', participantIds: ['char-lin-che'] },
        custom: {},
      },
    },
  },
] as const

export function seedBuiltInStories(database: Database) {
  const insertStory = database.query(`
    INSERT OR IGNORE INTO story_cards (
      id, title, cover, summary, description, background, world_rules,
      content_warnings_json, content_boundaries_json, tags_json,
      default_model_config_json, state_schema_json, default_state_json, state_policy_json,
      facts_json, lorebook_entries_json, nodes_json, declarative_mods_json,
      version, status, is_builtin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?)
  `)
  const insertCharacter = database.query(`
    INSERT OR IGNORE INTO characters (
      id, story_card_id, name, role_type, identity_text, appearance,
      personality, speech_style, goals, knowledge_scope, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertPlayer = database.query(`
    INSERT OR IGNORE INTO player_templates (id, story_card_id, role_name, background, goals, default_values_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertAbility = database.query(`
    INSERT OR IGNORE INTO abilities (id, story_card_id, name, category, description, prompt, enabled_by_default, sort_order)
    VALUES (?, ?, ?, 'player', ?, ?, 1, ?)
  `)
  const insertScene = database.query(`
    INSERT OR IGNORE INTO scenes (
      id, story_card_id, title, description, location, time_label,
      participant_ids_json, entry_method, opening_message, opening_sender,
      opening_character_id, initial_state_json, is_default, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
  `)
  const updateBuiltInCover = database.query('UPDATE story_cards SET cover = ? WHERE id = ? AND is_builtin = 1')

  const seed = database.transaction(() => {
    const timestamp = new Date().toISOString()
    for (const story of builtInStories) {
      insertStory.run(
        story.id,
        story.title,
        story.cover,
        story.summary,
        story.description,
        story.background,
        story.worldRules,
        JSON.stringify(story.warnings),
        JSON.stringify(story.boundaries),
        JSON.stringify(story.tags),
        JSON.stringify({ temperature: 0.8, maxTokens: 1600 }),
        JSON.stringify(defaultCustomStateSchema),
        JSON.stringify({}),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        timestamp,
        timestamp,
      )
      updateBuiltInCover.run(story.cover, story.id)
      story.characters.forEach((character, index) => {
        insertCharacter.run(
          character.id,
          story.id,
          character.name,
          character.roleType,
          character.identity,
          character.appearance,
          character.personality,
          character.speech,
          character.goals,
          character.knowledge,
          index,
        )
      })
      insertPlayer.run(
        story.player.id,
        story.id,
        story.player.roleName,
        story.player.background,
        story.player.goals,
        JSON.stringify(story.player.defaults),
      )
      story.abilities.forEach((ability, index) => {
        insertAbility.run(ability.id, story.id, ability.name, ability.description, ability.prompt, index)
      })
      insertScene.run(
        story.scene.id,
        story.id,
        story.scene.title,
        story.scene.description,
        story.scene.location,
        story.scene.time,
        JSON.stringify(story.scene.participants),
        story.scene.entryMethod,
        story.scene.opening,
        story.scene.openingSender,
        story.scene.openingCharacterId,
        JSON.stringify(story.scene.state),
      )
    }
  })

  seed()
}
