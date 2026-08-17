import { apiContracts, getSchemaErrorMessage, type LintIssue, storyDraftSchema } from '@storybound/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, BookOpen, Check, Copy, Save, Sparkles, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { api, post } from '../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../app/apiQueries'
import { usePromptDialog } from '../components/PromptDialog'
import { buttonClass, cx, noticeClass, ui } from '../shared/ui'
import { AbilitiesBlock } from './story-editor/AbilitiesBlock'
import { BasicBlock } from './story-editor/BasicBlock'
import { CharactersBlock } from './story-editor/CharactersBlock'
import { PlayerBlock } from './story-editor/PlayerBlock'
import { ScenesBlock } from './story-editor/ScenesBlock'
import { StateStructureBlock } from './story-editor/StateStructureBlock'
import {
  blankDraft,
  type DraftAbility,
  type DraftCharacter,
  type DraftScene,
  type EditorTab,
  type StoryDraft,
  storyToDraft,
} from './story-editor/types'

const tabs: Array<{ id: EditorTab; label: string }> = [
  { id: 'basic', label: '基础设定' },
  { id: 'characters', label: '人物' },
  { id: 'player', label: '玩家身份' },
  { id: 'abilities', label: '能力' },
  { id: 'state', label: '状态结构' },
  { id: 'scenes', label: '开场' },
]

type AiDraftIntent = 'draft' | 'complete' | 'repair' | 'opening' | 'conflict'

interface AiDraftAction {
  intent: AiDraftIntent
  label: string
  title: string
  promptLabel: string
  confirmLabel: string
  fallbackPrompt: string
}

const aiDraftActions: AiDraftAction[] = [
  {
    intent: 'complete',
    label: '补全',
    title: 'AI 补全故事草稿',
    promptLabel: '补全方向',
    confirmLabel: '补全并另存',
    fallbackPrompt: '基于已有前情和设定，补齐简介、人物动机、玩家身份、默认开场和内容边界。',
  },
  {
    intent: 'opening',
    label: '开场',
    title: 'AI 重写默认开场',
    promptLabel: '开场方向',
    confirmLabel: '重写并另存',
    fallbackPrompt: '重写默认开场，让第一幕更有悬念、可调查对象和玩家可立即采取的行动。',
  },
  {
    intent: 'conflict',
    label: '冲突',
    title: 'AI 强化人物冲突',
    promptLabel: '强化方向',
    confirmLabel: '强化并另存',
    fallbackPrompt: '强化人物关系、目标冲突、秘密、误解和玩家切入点，保持已有设定不变。',
  },
]

function tabForIssuePath(path: string): EditorTab {
  return path.startsWith('characters')
    ? 'characters'
    : path.startsWith('playerTemplate')
      ? 'player'
      : path.startsWith('abilities')
        ? 'abilities'
        : path.startsWith('facts') ||
            path.startsWith('nodes') ||
            path.startsWith('declarativeMods') ||
            path.startsWith('state')
          ? 'state'
          : path.startsWith('scenes')
            ? 'scenes'
            : 'basic'
}

function hasMeaningfulDraftContent(draft: StoryDraft) {
  return (
    Boolean(
      draft.title.trim() ||
        draft.summary.trim() ||
        draft.description.trim() ||
        draft.background.trim() ||
        draft.worldRules.trim() ||
        draft.cover.trim() !== '/covers/rain-terminal.png' ||
        draft.tags.length > 0 ||
        draft.contentWarnings.length > 0 ||
        draft.contentBoundaries.length > 0 ||
        draft.playerTemplate.roleName.trim() ||
        draft.playerTemplate.background.trim() ||
        draft.playerTemplate.goals.trim(),
    ) ||
    draft.characters.some(
      (character) =>
        character.name.trim() ||
        character.identity.trim() ||
        character.appearance.trim() ||
        character.personality.trim() ||
        character.speechStyle.trim() ||
        character.goals.trim() ||
        character.knowledgeScope.trim(),
    ) ||
    draft.scenes.some(
      (scene) =>
        (scene.title.trim() && scene.title !== '故事开始') ||
        scene.description.trim() ||
        scene.location.trim() ||
        scene.time.trim() ||
        scene.entryMethod.trim() ||
        scene.openingMessage.trim(),
    ) ||
    draft.abilities.length > 0 ||
    draft.facts.length > 0 ||
    draft.lorebookEntries.length > 0 ||
    draft.nodes.length > 0 ||
    draft.declarativeMods.length > 0
  )
}

function issuePrompt(issues: LintIssue[]) {
  const text = issues
    .slice(0, 12)
    .map((issue) => `${issue.severity === 'error' ? '错误' : '提示'}：${issue.message}`)
    .join('；')
  return (text ? `修复这些体检问题：${text}` : '修复故事卡体检问题，并补齐达到可发布状态所需的故事内容。').slice(0, 500)
}

export function StoryEditorPage() {
  const { storyId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initializedStoryRef = useRef<string | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [draft, setDraft] = useState<StoryDraft>(blankDraft)
  const [tab, setTab] = useState<EditorTab>('basic')
  const [issues, setIssues] = useState<LintIssue[]>([])
  const [saving, setSaving] = useState(false)
  const [linting, setLinting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [actionError, setActionError] = useState('')
  const [status, setStatus] = useState<'draft' | 'active'>('draft')
  const [isBuiltin, setIsBuiltin] = useState(false)
  const { promptText, promptDialog } = usePromptDialog()
  const editorContract = apiContracts.storyEditor(storyId || '')
  const storiesContract = apiContracts.stories()
  const editorQuery = useQuery({
    ...apiQueryOptions(editorContract, 5 * 60_000),
    enabled: Boolean(storyId),
  })
  const error = actionError || (editorQuery.error instanceof Error ? editorQuery.error.message : '')

  useEffect(() => {
    const story = editorQuery.data?.story
    if (!storyId || !story || initializedStoryRef.current === storyId) return
    initializedStoryRef.current = storyId
    setDraft(storyToDraft(story))
    setStatus(story.status === 'active' ? 'active' : 'draft')
    setIsBuiltin(story.isBuiltin)
  }, [editorQuery.data, storyId])

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const tabCounts = useMemo(() => {
    const result = new Map<EditorTab, number>()
    for (const issue of issues) {
      const target = tabForIssuePath(issue.path)
      result.set(target, (result.get(target) || 0) + 1)
    }
    return result
  }, [issues])

  function focusIssue(issue: LintIssue) {
    setTab(tabForIssuePath(issue.path))
    requestAnimationFrame(() => {
      const form = formRef.current
      if (!form) return
      const targets = Array.from(form.querySelectorAll<HTMLElement>('[data-story-path]'))
      const target =
        targets.find((element) => element.dataset.storyPath === issue.path) ||
        targets.find((element) => issue.path.startsWith(`${element.dataset.storyPath}.`)) ||
        targets.find((element) => element.dataset.storyPath?.startsWith(`${issue.path}.`))
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true })
    })
  }

  function updateCharacter(index: number, values: Partial<DraftCharacter>) {
    setDraft((current) => ({
      ...current,
      characters: current.characters.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)),
    }))
  }

  function removeCharacter(index: number) {
    const removed = draft.characters[index]
    setDraft((current) => ({
      ...current,
      characters: current.characters.filter((_, itemIndex) => itemIndex !== index),
      scenes: current.scenes.map((scene) => ({
        ...scene,
        participantIds: scene.participantIds.filter((id) => id !== removed.id),
        openingCharacterId: scene.openingCharacterId === removed.id ? null : scene.openingCharacterId,
        openingSender: scene.openingCharacterId === removed.id ? 'narrator' : scene.openingSender,
      })),
    }))
  }

  function updateAbility(index: number, values: Partial<DraftAbility>) {
    setDraft((current) => ({
      ...current,
      abilities: current.abilities.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)),
    }))
  }

  function updateScene(index: number, values: Partial<DraftScene>) {
    setDraft((current) => ({
      ...current,
      scenes: current.scenes.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)),
    }))
  }

  async function lint() {
    setLinting(true)
    setActionError('')
    try {
      const result = await post(apiContracts.lintStory(), storyDraftSchema.parse(draft))
      setIssues(result.issues)
      return result.issues
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '体检失败')
      return null
    } finally {
      setLinting(false)
    }
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault()
    if (isBuiltin) return null
    setSaving(true)
    setActionError('')
    try {
      const payload = storyDraftSchema.parse(draft)
      const result = storyId
        ? await api(apiContracts.updateStory(storyId), {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await post(apiContracts.createStory(), payload)
      queryClient.setQueryData(apiQueryKey(apiContracts.storyEditor(result.story.id)), { story: result.story })
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      void queryClient.invalidateQueries({
        queryKey: apiQueryKey(apiContracts.story(result.story.id)),
        exact: true,
      })
      setDraft(storyToDraft(result.story))
      setIssues(result.issues)
      setStatus(result.story.status === 'active' ? 'active' : 'draft')
      if (!storyId) navigate({ to: '/stories/$storyId/edit', params: { storyId: result.story.id }, replace: true })
      return result.story
    } catch (reason) {
      setActionError(getSchemaErrorMessage(reason, '保存失败'))
      return null
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    const saved = await saveDraft()
    const id = saved?.id || storyId
    if (!id) return
    setSaving(true)
    try {
      const result = await post(apiContracts.publishStory(id))
      queryClient.setQueryData(apiQueryKey(apiContracts.story(result.story.id)), { story: result.story })
      setIssues(result.issues)
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      navigate({ to: '/stories/$storyId', params: { storyId: result.story.id } })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '发布失败')
      await lint()
    } finally {
      setSaving(false)
    }
  }

  async function duplicate() {
    if (!storyId) return
    setDuplicating(true)
    setActionError('')
    try {
      const result = await post(apiContracts.duplicateStory(storyId))
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      navigate({ to: '/stories/$storyId/edit', params: { storyId: result.story.id } })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '复制失败')
    } finally {
      setDuplicating(false)
    }
  }

  async function runAiDraftAction(action: AiDraftAction) {
    const hasBaseDraft = hasMeaningfulDraftContent(draft)
    const prompt = await promptText({
      title: action.title,
      label: action.promptLabel,
      confirmLabel: action.confirmLabel,
      initialValue: action.fallbackPrompt,
      maxLength: 500,
    })
    if (!prompt) return
    setGenerating(true)
    setActionError('')
    try {
      const result = await post(apiContracts.generateStoryDraft(), {
        prompt,
        intent: action.intent,
        ...(hasBaseDraft || action.intent !== 'draft' ? { baseDraft: draft } : {}),
      })
      queryClient.setQueryData(apiQueryKey(apiContracts.storyEditor(result.story.id)), { story: result.story })
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      setDraft(storyToDraft(result.story))
      setIssues(result.issues)
      setStatus(result.story.status === 'active' ? 'active' : 'draft')
      setIsBuiltin(false)
      navigate({ to: '/stories/$storyId/edit', params: { storyId: result.story.id } })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'AI 生成故事草稿失败')
    } finally {
      setGenerating(false)
    }
  }

  async function generateDraftWithAi() {
    const hasBaseDraft = hasMeaningfulDraftContent(draft)
    await runAiDraftAction({
      intent: hasBaseDraft ? 'complete' : 'draft',
      label: hasBaseDraft ? '补全' : '生成',
      title: hasBaseDraft ? 'AI 补全故事草稿' : 'AI 生成故事草稿',
      promptLabel: hasBaseDraft ? '补全方向' : '一句话灵感',
      confirmLabel: hasBaseDraft ? '补全并另存' : '生成草稿',
      fallbackPrompt: hasBaseDraft ? '基于已有前情和设定，补齐简介、人物动机、玩家身份、默认开场和内容边界。' : '',
    })
  }

  async function repairDraftWithAi() {
    const currentIssues = issues.length > 0 ? issues : await lint()
    if (!currentIssues) return
    await runAiDraftAction({
      intent: 'repair',
      label: '修复',
      title: 'AI 修复体检问题',
      promptLabel: '修复目标',
      confirmLabel: '修复并另存',
      fallbackPrompt: issuePrompt(currentIssues),
    })
  }

  async function removeDraft() {
    if (!storyId || isBuiltin || status !== 'draft' || saving) return
    if (!window.confirm(`删除草稿“${draft.title || '未命名故事'}”？`)) return
    setSaving(true)
    setActionError('')
    try {
      await api(apiContracts.deleteStory(storyId), { method: 'DELETE' })
      await queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      navigate({ to: '/', replace: true })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '删除草稿失败')
      setSaving(false)
    }
  }

  if (storyId && editorQuery.isPending)
    return <div className={cx(ui.page, 'grid min-h-64 place-items-center text-muted')}>正在展开故事稿…</div>

  return (
    <div className="min-h-[calc(100dvh-60px)] bg-[#f0f3f0]">
      <header className="sticky top-0 z-15 grid h-16 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line bg-surface px-2 sm:gap-[13px] sm:px-6">
        {storyId && status === 'active' ? (
          <Link className={ui.iconButton} to="/stories/$storyId" params={{ storyId }} title="返回" aria-label="返回">
            <ArrowLeft size={18} />
          </Link>
        ) : (
          <Link className={ui.iconButton} to="/" title="返回" aria-label="返回">
            <ArrowLeft size={18} />
          </Link>
        )}
        <div className="grid min-w-0 gap-[3px]">
          <strong className="truncate font-serif text-[15px] leading-[1.2] font-bold">
            {draft.title || '未命名故事'}
          </strong>
          <span className="text-[10px] text-muted">
            {isBuiltin ? '内置故事卡 · 只读' : status === 'active' ? '已发布' : '草稿'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-[7px]">
          <button
            className={buttonClass('secondary', 'size-10 min-h-10 px-0')}
            type="button"
            onClick={() => void generateDraftWithAi()}
            disabled={generating || saving || duplicating}
            title={generating ? 'AI 生成中' : hasMeaningfulDraftContent(draft) ? 'AI 补全故事草稿' : 'AI 生成故事草稿'}
            aria-label={
              generating ? 'AI 生成中' : hasMeaningfulDraftContent(draft) ? 'AI 补全故事草稿' : 'AI 生成故事草稿'
            }
          >
            <Sparkles size={16} />
          </button>
          <button
            className={buttonClass('secondary', 'size-10 min-h-10 px-0 sm:w-auto sm:px-4')}
            type="button"
            onClick={() => void lint()}
            disabled={linting || generating}
          >
            <Check size={15} />
            <span className="hidden sm:block">体检</span>
          </button>
          {isBuiltin ? (
            <button
              className={buttonClass('primary', 'h-10 min-h-10 px-3')}
              type="button"
              onClick={() => void duplicate()}
              disabled={duplicating || generating}
            >
              <Copy size={15} />
              <span>复制为草稿</span>
            </button>
          ) : (
            <>
              {storyId && status === 'draft' && (
                <button
                  className={cx(
                    ui.iconButton,
                    'size-10 border border-[#dfc4bd] bg-red-soft text-red hover:border-[#c9958b] hover:bg-[#f1d8d3]',
                  )}
                  type="button"
                  onClick={() => void removeDraft()}
                  disabled={saving || generating}
                  title="删除草稿"
                  aria-label="删除草稿"
                >
                  <Trash2 size={17} />
                </button>
              )}
              <button
                className={buttonClass('secondary', 'size-10 min-h-10 px-0 sm:w-auto sm:px-4')}
                type="button"
                onClick={() => void saveDraft()}
                disabled={saving || generating}
              >
                <Save size={15} />
                <span className="hidden sm:block">{saving ? '保存中…' : '保存草稿'}</span>
              </button>
              <button
                className={buttonClass('primary', 'h-10 min-h-10 px-3')}
                type="button"
                onClick={() => void publish()}
                disabled={saving || generating}
              >
                <BookOpen size={15} />
                <span>发布</span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="mx-auto grid w-[calc(100%-1.5rem)] max-w-[1180px] items-start md:w-[calc(100%-3rem)] md:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          className="sticky top-16 z-10 flex gap-1 overflow-x-auto bg-[#f0f3f0] py-3 md:grid md:bg-transparent md:pt-8 md:pr-5 md:pb-8"
          aria-label="故事编辑分区"
        >
          {tabs.map((item) => (
            <button
              className={cx(
                'flex min-h-10 shrink-0 cursor-pointer items-center justify-between gap-2 rounded border-0 bg-transparent px-[11px] text-left text-xs text-muted hover:bg-[#e6ebe7] md:w-full',
                tab === item.id && 'bg-green-soft font-bold text-green',
              )}
              type="button"
              onClick={() => setTab(item.id)}
              key={item.id}
            >
              <span>{item.label}</span>
              {tabCounts.get(item.id) ? (
                <em className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-red text-[9px] not-italic text-white">
                  {tabCounts.get(item.id)}
                </em>
              ) : null}
            </button>
          ))}
        </nav>

        <form
          ref={formRef}
          className="min-h-[calc(100dvh-124px)] min-w-0 pb-20 md:border-l md:border-line md:pt-[34px] md:pl-10"
          onSubmit={saveDraft}
        >
          {error && <div className={noticeClass(true, 'mb-[18px]')}>{error}</div>}
          <section className="mb-4 flex flex-wrap gap-2 border-b border-line pb-4" aria-label="AI 故事创作">
            {aiDraftActions.map((action) => (
              <button
                className={buttonClass('secondary', 'h-9 min-h-9 px-3')}
                type="button"
                onClick={() => void runAiDraftAction(action)}
                disabled={generating || saving || duplicating}
                key={action.intent}
              >
                <Sparkles size={14} /> {action.label}
              </button>
            ))}
            <button
              className={buttonClass('secondary', 'h-9 min-h-9 px-3')}
              type="button"
              onClick={() => void repairDraftWithAi()}
              disabled={generating || saving || duplicating || linting}
            >
              <Check size={14} /> 修复体检
            </button>
          </section>
          {issues.length > 0 && (
            <section
              className={cx(
                'mb-5 flex items-start gap-2.5 border border-[#c8d7cc] bg-green-soft px-[15px] py-[13px] text-green',
                errorCount > 0 && 'border-[#dfc4bd] bg-red-soft text-[#6d3c34]',
              )}
            >
              <AlertCircle size={17} />
              <div className="min-w-0">
                <strong className="text-xs">{errorCount ? `${errorCount} 项需要修正` : '故事卡可以发布'}</strong>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {issues.map((issue, index) => (
                    <button
                      className="inline-flex min-h-7 max-w-full cursor-pointer items-center gap-1 rounded border border-current/25 bg-white/35 px-2 text-left text-[11px] leading-[1.35] text-current hover:bg-white/60"
                      type="button"
                      key={`${issue.path}-${index}`}
                      onClick={() => focusIssue(issue)}
                    >
                      <span className="shrink-0 font-semibold">{issue.severity === 'error' ? '错误' : '提示'}</span>
                      <span className="truncate">{issue.message}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {tab === 'basic' && <BasicBlock draft={draft} onChange={setDraft} />}
          {tab === 'characters' && (
            <CharactersBlock draft={draft} onChange={setDraft} onUpdate={updateCharacter} onRemove={removeCharacter} />
          )}
          {tab === 'player' && <PlayerBlock draft={draft} onChange={setDraft} />}
          {tab === 'abilities' && <AbilitiesBlock draft={draft} onChange={setDraft} onUpdate={updateAbility} />}
          {tab === 'state' && <StateStructureBlock draft={draft} onChange={setDraft} />}
          {tab === 'scenes' && <ScenesBlock draft={draft} onChange={setDraft} onUpdate={updateScene} />}
        </form>
      </div>
      {promptDialog}
    </div>
  )
}
