import type { Database } from 'bun:sqlite'
import { db } from '../../db/connection'
import type { GenerateStoryDraftInput, StoryDraftInput } from '../../domain/schemas'
import { storyDraftSchema } from '../../domain/schemas'
import { ModelProviderError, type ModelStreamChunk, type ModelStreamInput } from '../../llm/adapter'
import type { ModelProviderSnapshot } from '../../repositories/modelProviders'
import { AppError } from '../../shared/errors'
import { createStoryDraft } from './drafts'
import { lintStoryDraft } from './lint'

type ModelStreamer = (input: ModelStreamInput) => AsyncIterable<ModelStreamChunk>

interface GenerateStoryDraftDependencies {
  provider: ModelProviderSnapshot
  stream: ModelStreamer
  signal?: AbortSignal
  database?: Database
}

const maxDraftResponseChars = 80_000
const maxRepairSourceChars = 60_000

const storyDraftSystemPrompt = [
  '你是 Storybound 的故事卡设计器。',
  '你必须把用户的一句话灵感扩展为一份可编辑的 Storybound 故事草稿。',
  '只返回一个 JSON 对象，不要返回 Markdown、代码围栏、解释或多余文字。',
  'JSON 字段使用 camelCase，必须符合 Storybound storyDraftSchema。',
  '不要填写 version。只有当 scenes 需要引用角色时，才给对应角色填写 c1、c2 这类临时 id，并在 participantIds/openingCharacterId 使用同一临时 id；系统会重新映射。',
  '保持草稿紧凑但可玩，优先提供 title、summary、description、background、worldRules、contentBoundaries、tags、characters、playerTemplate、scenes。',
  '如果不确定角色引用关系，可以让 participantIds 为空、openingSender 使用 narrator、openingCharacterId 使用 null。',
].join('\n')

const storyDraftRepairSystemPrompt = [
  '你是 Storybound 的故事卡 JSON 修复器。',
  '你必须把输入修复为符合 Storybound storyDraftSchema 的 JSON 对象。',
  '只返回修复后的 JSON 对象，不要返回 Markdown、代码围栏、解释或多余文字。',
  '如果字段缺失，请根据用户灵感和当前草稿补齐；如果引用关系不确定，使用旁白开场并清空不确定的引用。',
].join('\n')

const intentGuides: Record<GenerateStoryDraftInput['intent'], string[]> = {
  draft: ['把一句话灵感扩展为完整故事卡，优先保证可以直接编辑和发布。'],
  complete: [
    '以当前草稿为基础补全缺失内容，不要无故删除用户已有非空字段。',
    '重点补齐简介、人物动机、玩家身份、默认开场、内容边界和可调查对象。',
  ],
  repair: [
    '以当前草稿为基础修复体检问题，不要只解释问题。',
    '必须让背景、世界规则、人物身份、玩家身份和默认开场尽量达到可发布状态。',
    'AI 建议不能改变确定性状态 Schema 的含义，除非用户提示明确要求。',
  ],
  opening: [
    '以当前草稿为基础重写默认开场。',
    '开场要有清晰地点、时间、可调查物、当前张力和玩家可立即采取的行动。',
    '不得替玩家决定行动、情绪、记忆或身份。',
  ],
  conflict: [
    '以当前草稿为基础强化人物关系、目标冲突、秘密、误解和玩家切入点。',
    '至少让主要人物拥有彼此不完全一致的目标，并让玩家身份自然介入冲突。',
    '可以补充公开事实、秘密事实或世界书资料，但不能破坏已有设定。',
  ],
}

function intentLabel(intent: GenerateStoryDraftInput['intent']) {
  const labels: Record<GenerateStoryDraftInput['intent'], string> = {
    draft: '生成故事草稿',
    complete: '补全故事草稿',
    repair: '修复故事体检问题',
    opening: '重写默认开场',
    conflict: '强化人物冲突',
  }
  return labels[intent]
}

function limitText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`
}

function compactDraftForModel(draft: GenerateStoryDraftInput['baseDraft']) {
  if (!draft) return null
  return {
    title: draft.title,
    summary: draft.summary,
    description: limitText(draft.description, 2_000),
    background: limitText(draft.background, 4_000),
    worldRules: limitText(draft.worldRules, 3_000),
    contentWarnings: draft.contentWarnings,
    contentBoundaries: draft.contentBoundaries,
    tags: draft.tags,
    stateSchema: draft.stateSchema,
    defaultState: draft.defaultState,
    statePolicy: draft.statePolicy,
    characters: draft.characters.slice(0, 8).map((character) => ({
      ...character,
      identity: limitText(character.identity, 800),
      appearance: limitText(character.appearance, 600),
      personality: limitText(character.personality, 600),
      speechStyle: limitText(character.speechStyle, 500),
      goals: limitText(character.goals, 600),
      knowledgeScope: limitText(character.knowledgeScope, 700),
    })),
    playerTemplate: {
      ...draft.playerTemplate,
      background: limitText(draft.playerTemplate.background, 1_000),
      goals: limitText(draft.playerTemplate.goals, 700),
    },
    abilities: draft.abilities.slice(0, 8).map((ability) => ({
      ...ability,
      description: limitText(ability.description, 500),
      prompt: limitText(ability.prompt, 1_200),
    })),
    facts: draft.facts.slice(0, 16).map((fact) => ({ ...fact, content: limitText(fact.content, 700) })),
    lorebookEntries: draft.lorebookEntries
      .slice(0, 16)
      .map((entry) => ({ ...entry, content: limitText(entry.content, 900) })),
    nodes: draft.nodes.slice(0, 12).map((node) => ({
      ...node,
      description: limitText(node.description, 600),
      prompt: limitText(node.prompt, 900),
    })),
    declarativeMods: draft.declarativeMods.slice(0, 8).map((mod) => ({
      ...mod,
      description: limitText(mod.description, 500),
      prompt: limitText(mod.prompt, 900),
    })),
    scenes: draft.scenes.slice(0, 8).map((scene) => ({
      ...scene,
      description: limitText(scene.description, 700),
      entryMethod: limitText(scene.entryMethod, 500),
      openingMessage: limitText(scene.openingMessage, 1_200),
    })),
  }
}

function baseDraftPromptSection(input: GenerateStoryDraftInput) {
  const compact = compactDraftForModel(input.baseDraft)
  if (!compact) return []
  return ['', '当前草稿 JSON（请以此为基础补全；已有非空字段和高级结构不要无故删除）：', JSON.stringify(compact)]
}

function buildStoryDraftPrompt(input: GenerateStoryDraftInput) {
  const hasBaseDraft = Boolean(input.baseDraft)
  const intent = input.intent || 'draft'
  return [
    `任务：${intentLabel(intent)}`,
    hasBaseDraft ? `创作方向：${input.prompt}` : `一句话灵感：${input.prompt}`,
    ...baseDraftPromptSection(input),
    '',
    '本次任务要求：',
    ...intentGuides[intent].map((item) => `- ${item}`),
    '',
    hasBaseDraft ? '请返回补全后的中文故事草稿 JSON：' : '请生成一份中文故事草稿 JSON：',
    '- title: 12 字以内，清楚表达题材。',
    '- summary: 一句话说明核心冲突。',
    '- description/background/worldRules: 给编辑者足够的前情、世界规则和叙事约束。',
    '- contentBoundaries: 至少 2 条，避免替玩家做决定、避免无提示改变玩家身份。',
    '- characters: 1 到 3 个主要或关联人物。',
    '- playerTemplate: 给出推荐玩家身份、背景和目标。',
    '- scenes: 至少 1 个默认开场，openingMessage 要能直接开始互动。',
    '- 高级字段如 stateSchema/defaultState/statePolicy/abilities/facts/lorebookEntries/nodes/declarativeMods 可以省略，除非对故事明显有用。',
  ].join('\n')
}

function buildRepairPrompt(input: GenerateStoryDraftInput, rawDraft: string) {
  return [
    `用户灵感或补全方向：${input.prompt}`,
    ...baseDraftPromptSection(input),
    '',
    '上一轮模型输出如下，它不是合法的 Storybound 故事草稿 JSON。请修复为合法 JSON：',
    limitText(rawDraft, maxRepairSourceChars),
  ].join('\n')
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = (fenced?.[1] || trimmed).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    const firstBrace = candidate.indexOf('{')
    const lastBrace = candidate.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
    throw new AppError(502, 'MODEL_STORY_DRAFT_JSON_INVALID', 'AI 返回的故事草稿不是有效 JSON，请换一句提示重试')
  }
}

function mergeWithBaseDraft(parsed: Record<string, unknown>, baseDraft?: GenerateStoryDraftInput['baseDraft']) {
  if (!baseDraft) return parsed
  const merged: Record<string, unknown> = { ...baseDraft, ...parsed }
  if (parsed.playerTemplate && typeof parsed.playerTemplate === 'object' && !Array.isArray(parsed.playerTemplate)) {
    const playerTemplate = parsed.playerTemplate as Record<string, unknown>
    merged.playerTemplate = {
      ...baseDraft.playerTemplate,
      ...playerTemplate,
      defaultValues:
        playerTemplate.defaultValues && typeof playerTemplate.defaultValues === 'object'
          ? { ...baseDraft.playerTemplate.defaultValues, ...playerTemplate.defaultValues }
          : baseDraft.playerTemplate.defaultValues,
    }
  }
  return merged
}

function parseStoryDraftCandidate(raw: string, baseDraft?: GenerateStoryDraftInput['baseDraft']): StoryDraftInput {
  let parsed: unknown
  try {
    parsed = extractJsonObject(raw)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(502, 'MODEL_STORY_DRAFT_JSON_INVALID', 'AI 返回的故事草稿不是有效 JSON，请换一句提示重试')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError(502, 'MODEL_STORY_DRAFT_JSON_INVALID', 'AI 返回的故事草稿不是 JSON 对象，请换一句提示重试')
  }
  try {
    return storyDraftSchema.parse(mergeWithBaseDraft(parsed as Record<string, unknown>, baseDraft))
  } catch {
    throw new AppError(502, 'MODEL_STORY_DRAFT_INVALID', 'AI 返回的故事草稿格式不正确，请换一句提示重试')
  }
}

function isDraftCandidateError(error: unknown) {
  return (
    error instanceof AppError &&
    (error.code === 'MODEL_STORY_DRAFT_JSON_INVALID' || error.code === 'MODEL_STORY_DRAFT_INVALID')
  )
}

function normalizeGenerationError(error: unknown) {
  if (error instanceof AppError) return error
  if (error instanceof ModelProviderError) {
    const message = error.message.replace('，输入已保存', '')
    const status = error.status === 429 ? 429 : error.retryable ? 503 : 502
    return new AppError(status, error.code, message || 'AI 生成故事草稿失败，请稍后重试')
  }
  return new AppError(502, 'MODEL_STORY_DRAFT_FAILED', 'AI 生成故事草稿失败，请稍后重试')
}

async function collectModelText(dependencies: GenerateStoryDraftDependencies, system: string, userContent: string) {
  let content = ''
  for await (const chunk of dependencies.stream({
    system,
    messages: [{ role: 'user', content: userContent }],
    signal: dependencies.signal || new AbortController().signal,
    provider: dependencies.provider,
  })) {
    if (chunk.type !== 'text') continue
    content += chunk.text
    if (content.length > maxDraftResponseChars) {
      throw new AppError(502, 'MODEL_STORY_DRAFT_TOO_LONG', 'AI 返回的故事草稿过长，请换一句更聚焦的提示重试')
    }
  }
  const trimmed = content.trim()
  if (!trimmed) throw new AppError(502, 'MODEL_STORY_DRAFT_EMPTY', 'AI 没有返回故事草稿，请稍后重试')
  return trimmed
}

export async function generateStoryDraftFromPrompt(
  input: GenerateStoryDraftInput,
  dependencies: GenerateStoryDraftDependencies,
) {
  let rawDraft = ''
  try {
    rawDraft = await collectModelText(dependencies, storyDraftSystemPrompt, buildStoryDraftPrompt(input))
  } catch (error) {
    throw normalizeGenerationError(error)
  }
  let draft: StoryDraftInput
  try {
    draft = parseStoryDraftCandidate(rawDraft, input.baseDraft)
  } catch (error) {
    if (!isDraftCandidateError(error)) throw error
    try {
      const repairedDraft = await collectModelText(
        dependencies,
        storyDraftRepairSystemPrompt,
        buildRepairPrompt(input, rawDraft),
      )
      draft = parseStoryDraftCandidate(repairedDraft, input.baseDraft)
    } catch (repairError) {
      if (isDraftCandidateError(repairError)) throw repairError
      throw normalizeGenerationError(repairError)
    }
  }
  const database = dependencies.database || db
  const story = createStoryDraft(draft, database)
  return { story, issues: lintStoryDraft(storyDraftSchema.parse(story)) }
}
