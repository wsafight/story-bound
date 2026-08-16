import { apiContracts, getSchemaErrorMessage, type LintIssue, storyDraftSchema } from '@storybound/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, BookOpen, Check, Copy, Save, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { api, post } from '../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../app/apiQueries'
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

export function StoryEditorPage() {
  const { storyId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initializedStoryRef = useRef<string | null>(null)
  const [draft, setDraft] = useState<StoryDraft>(blankDraft)
  const [tab, setTab] = useState<EditorTab>('basic')
  const [issues, setIssues] = useState<LintIssue[]>([])
  const [saving, setSaving] = useState(false)
  const [linting, setLinting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [actionError, setActionError] = useState('')
  const [status, setStatus] = useState<'draft' | 'active'>('draft')
  const [isBuiltin, setIsBuiltin] = useState(false)
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
      const target: EditorTab = issue.path.startsWith('characters')
        ? 'characters'
        : issue.path.startsWith('playerTemplate')
          ? 'player'
          : issue.path.startsWith('abilities')
            ? 'abilities'
            : issue.path.startsWith('facts') ||
                issue.path.startsWith('nodes') ||
                issue.path.startsWith('declarativeMods') ||
                issue.path.startsWith('state')
              ? 'state'
              : issue.path.startsWith('scenes')
                ? 'scenes'
                : 'basic'
      result.set(target, (result.get(target) || 0) + 1)
    }
    return result
  }, [issues])

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
            className={buttonClass('secondary', 'size-10 min-h-10 px-0 sm:w-auto sm:px-4')}
            type="button"
            onClick={() => void lint()}
            disabled={linting}
          >
            <Check size={15} />
            <span className="hidden sm:block">体检</span>
          </button>
          {isBuiltin ? (
            <button
              className={buttonClass('primary', 'h-10 min-h-10 px-3')}
              type="button"
              onClick={() => void duplicate()}
              disabled={duplicating}
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
                  disabled={saving}
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
                disabled={saving}
              >
                <Save size={15} />
                <span className="hidden sm:block">{saving ? '保存中…' : '保存草稿'}</span>
              </button>
              <button
                className={buttonClass('primary', 'h-10 min-h-10 px-3')}
                type="button"
                onClick={() => void publish()}
                disabled={saving}
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
          className="min-h-[calc(100dvh-124px)] min-w-0 pb-20 md:border-l md:border-line md:pt-[34px] md:pl-10"
          onSubmit={saveDraft}
        >
          {error && <div className={noticeClass(true, 'mb-[18px]')}>{error}</div>}
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
                <p className="mt-1 mb-0 text-[11px] leading-[1.6] text-current">
                  {issues.map((issue) => issue.message).join('；')}
                </p>
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
    </div>
  )
}
