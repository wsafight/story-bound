import { type StoryDraftInput, storyDraftSchema } from '../../domain/schemas'
import { lintStoryDraft } from './lint'

type JsonRecord = Record<string, any>
type StoryImportAdapterId = 'storybound' | 'sillytavern-character' | 'unsupported'
type StoryImportIssue = { severity: 'error' | 'warning'; code: string; path: string; message: string }
type StoryImportInspection = { report: StoryImportReport; draft: StoryDraftInput | null }

export type NormalizedStoryImport = {
  rawPackage: JsonRecord
  dryRun: boolean
}

export type StoryImportReport = {
  format: string
  formatVersion: number | null
  adapter: StoryImportAdapterId
  canImport: boolean
  dryRun: boolean
  storyTitle: string
  counts: {
    characters: number
    abilities: number
    scenes: number
    facts: number
    lorebookEntries: number
    nodes: number
    declarativeMods: number
  }
  issues: StoryImportIssue[]
  unknownTopLevelFields: string[]
  mediaFiles: string[]
  conversion: {
    lossy: boolean
    warnings: string[]
  }
}

type StoryImportAdapter = {
  id: Exclude<StoryImportAdapterId, 'unsupported'>
  detect: (input: NormalizedStoryImport) => boolean
  inspect: (input: NormalizedStoryImport) => StoryImportInspection
}

const packageFields = new Set(['format', 'formatVersion', 'exportedAt', 'compatibility', 'story'])
const sillyTavernCharacterFields = new Set(['spec', 'spec_version', 'data'])

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter(Boolean)
        .slice(0, 20)
    : []
}

function formatVersion(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function preview(value: string, limit = 220) {
  const text = value.trim().replace(/\s+/g, ' ')
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

export function normalizeStoryImport(input: unknown): NormalizedStoryImport {
  if (!isRecord(input)) return { rawPackage: {}, dryRun: true }
  if (isRecord(input.package)) return { rawPackage: input.package, dryRun: input.dryRun !== false }
  return { rawPackage: input, dryRun: true }
}

function emptyReport(input: NormalizedStoryImport): StoryImportReport {
  return {
    format: String(input.rawPackage.format || 'unknown'),
    formatVersion: formatVersion(input.rawPackage.formatVersion),
    adapter: 'unsupported',
    canImport: false,
    dryRun: input.dryRun,
    storyTitle: '',
    counts: {
      characters: 0,
      abilities: 0,
      scenes: 0,
      facts: 0,
      lorebookEntries: 0,
      nodes: 0,
      declarativeMods: 0,
    },
    issues: [],
    unknownTopLevelFields: Object.keys(input.rawPackage).filter((key) => !packageFields.has(key)),
    mediaFiles: [],
    conversion: {
      lossy: false,
      warnings: [],
    },
  }
}

function mediaFiles(input: StoryDraftInput) {
  return [input.cover].filter((value) => value && !value.startsWith('/covers/'))
}

function draftCounts(draft: StoryDraftInput) {
  return {
    characters: draft.characters.length,
    abilities: draft.abilities.length,
    scenes: draft.scenes.length,
    facts: draft.facts.length,
    lorebookEntries: draft.lorebookEntries.length,
    nodes: draft.nodes.length,
    declarativeMods: draft.declarativeMods.length,
  }
}

function lintIssues(draft: StoryDraftInput) {
  return lintStoryDraft(draft).map((issue) => ({
    severity: issue.severity,
    code: issue.severity === 'error' ? 'STORY_LINT_ERROR' : 'STORY_LINT_WARNING',
    path: issue.path,
    message: issue.message,
  }))
}

function emptyStoryDraft(title: string): StoryDraftInput {
  const characterId = crypto.randomUUID()
  return {
    title,
    cover: '/covers/rain-terminal.png',
    summary: '',
    description: '',
    background: '',
    worldRules: '',
    contentWarnings: [],
    contentBoundaries: [],
    tags: [],
    stateSchema: { type: 'object', properties: {}, additionalProperties: false },
    defaultState: {},
    statePolicy: [],
    characters: [
      {
        id: characterId,
        name: title,
        roleType: 'main',
        identity: '',
        appearance: '',
        personality: '',
        speechStyle: '',
        goals: '',
        knowledgeScope: '',
      },
    ],
    abilities: [],
    facts: [],
    lorebookEntries: [],
    nodes: [],
    declarativeMods: [],
    scenes: [
      {
        id: crypto.randomUUID(),
        title: '初始场景',
        description: '',
        location: '未指定',
        time: '未指定',
        participantIds: [characterId],
        entryMethod: '',
        openingMessage: '',
        openingSender: 'character',
        openingCharacterId: characterId,
        initialState: {
          phase: '故事开始',
          scene: { location: '未指定', time: '未指定', participantIds: [characterId] },
          custom: {},
        },
        isDefault: true,
      },
    ],
    playerTemplate: {
      id: crypto.randomUUID(),
      roleName: '来访者',
      background: '',
      goals: `与${title}互动并推动故事。`,
      defaultValues: { name: '', pronouns: '不限定', note: '' },
    },
  }
}

function inspectStoryboundPackage(input: NormalizedStoryImport): StoryImportInspection {
  const report = emptyReport(input)
  if (input.rawPackage.formatVersion !== 1) {
    report.issues.push({
      severity: 'error',
      code: 'UNSUPPORTED_FORMAT_VERSION',
      path: 'formatVersion',
      message: '当前只支持 formatVersion = 1 的故事卡包',
    })
    return { report, draft: null }
  }
  const result = storyDraftSchema.safeParse(input.rawPackage.story)
  if (!result.success) {
    report.issues.push({
      severity: 'error',
      code: 'STORY_DRAFT_INVALID',
      path: 'story',
      message: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；'),
    })
    return { report, draft: null }
  }
  const draft = result.data
  const issues = lintIssues(draft)
  return {
    report: {
      ...report,
      format: 'storybound.story-card',
      formatVersion: 1,
      canImport: !issues.some((issue) => issue.severity === 'error'),
      adapter: 'storybound',
      storyTitle: draft.title,
      counts: draftCounts(draft),
      issues,
      mediaFiles: mediaFiles(draft),
      conversion: {
        lossy: false,
        warnings: [],
      },
    },
    draft,
  }
}

function inspectSillyTavernCharacter(input: NormalizedStoryImport): StoryImportInspection {
  const report = emptyReport(input)
  const data = isRecord(input.rawPackage.data) ? input.rawPackage.data : {}
  const name = asString(data.name || input.rawPackage.name) || '导入角色卡'
  const firstMessage = asString(data.first_mes)
  const description = asString(data.description)
  const personality = asString(data.personality)
  const scenario = asString(data.scenario)
  const examples = asString(data.mes_example)
  const systemPrompt = asString(data.system_prompt)
  const postHistory = asString(data.post_history_instructions)
  const creatorNotes = asString(data.creator_notes)
  const tags = asStringArray(data.tags)
  const draft = emptyStoryDraft(name)
  const characterId = String(draft.characters[0].id)
  draft.summary = preview(description || scenario || firstMessage || `${name} 的导入角色卡`, 180)
  draft.description = [creatorNotes, description].filter(Boolean).join('\n\n')
  draft.background = scenario || description || firstMessage || `${name} 的导入角色卡背景。`
  draft.worldRules =
    [systemPrompt, postHistory].filter(Boolean).join('\n\n') ||
    '保持角色卡原始设定，不越过已给出的身份、关系和场景边界。'
  draft.tags = tags
  draft.characters[0] = {
    ...draft.characters[0],
    identity: description,
    personality,
    speechStyle: examples,
    goals: scenario,
  }
  draft.scenes[0] = {
    ...draft.scenes[0],
    description: scenario || description,
    openingMessage: firstMessage || `${name}看向你，等待你开口。`,
  }
  draft.playerTemplate.background = '玩家身份在建档时设定。'
  const characterBook = isRecord(data.character_book) ? data.character_book : null
  const entries = Array.isArray(characterBook?.entries) ? characterBook.entries : []
  draft.lorebookEntries = entries
    .filter(isRecord)
    .map((entry, index) => {
      const keywords = asStringArray(entry.keys || entry.key || entry.keywords)
      return {
        id: crypto.randomUUID(),
        title: asString(entry.comment || entry.name) || keywords[0] || `导入资料 ${index + 1}`,
        content: asString(entry.content),
        keywords,
        condition: {},
        scope: 'story' as const,
        sceneIds: [],
        characterIds: [],
        chapterNumbers: [],
        priority: index < 5 ? ('medium' as const) : ('low' as const),
        enabled: entry.disable !== true && entry.enabled !== false,
      }
    })
    .filter((entry) => entry.content)

  const parsed = storyDraftSchema.safeParse(draft)
  report.format = 'sillytavern.character-card'
  report.formatVersion = formatVersion(input.rawPackage.spec_version)
  report.adapter = 'sillytavern-character'
  report.storyTitle = name
  report.unknownTopLevelFields = Object.keys(input.rawPackage).filter((key) => !sillyTavernCharacterFields.has(key))
  report.conversion = {
    lossy: true,
    warnings: ['角色卡会被转换为单角色故事草稿；问候语进入默认开场；character_book 条目进入故事 Lorebook。'],
  }
  report.issues.push({
    severity: 'warning',
    code: 'LOSSY_EXTERNAL_IMPORT',
    path: 'data',
    message: '外部角色卡没有 Storybound 的完整故事、节点、状态策略和能力结构，导入时会生成可继续编辑的草稿。',
  })
  if (!parsed.success) {
    report.issues.push({
      severity: 'error',
      code: 'STORY_DRAFT_INVALID',
      path: 'data',
      message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；'),
    })
    return { report, draft: null }
  }
  const issues = lintIssues(parsed.data)
  return {
    report: {
      ...report,
      canImport: !issues.some((issue) => issue.severity === 'error'),
      counts: draftCounts(parsed.data),
      issues: [...report.issues, ...issues],
      mediaFiles: mediaFiles(parsed.data),
    },
    draft: parsed.data,
  }
}

export const storyImportAdapters: StoryImportAdapter[] = [
  {
    id: 'storybound',
    detect: (input) => input.rawPackage.format === 'storybound.story-card',
    inspect: inspectStoryboundPackage,
  },
  {
    id: 'sillytavern-character',
    detect: (input) => input.rawPackage.spec === 'chara_card_v2',
    inspect: inspectSillyTavernCharacter,
  },
]

export function detectStoryImportFormat(input: NormalizedStoryImport) {
  return storyImportAdapters.find((adapter) => adapter.detect(input)) || null
}

export function inspectNormalizedStoryImport(input: NormalizedStoryImport): StoryImportInspection {
  const adapter = detectStoryImportFormat(input)
  if (adapter) return adapter.inspect(input)
  const report = emptyReport(input)
  report.issues.push({
    severity: 'error',
    code: 'UNSUPPORTED_IMPORT_FORMAT',
    path: 'format',
    message: '当前支持 Storybound 自有故事卡 JSON 包和 SillyTavern V2 角色卡导入',
  })
  return { report, draft: null }
}
