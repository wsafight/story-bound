import {
  apiContracts,
  createConversationSchema,
  getSchemaErrorMessage,
  type NarrativePreferences,
  type StoryDetail,
} from '@storybound/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { post } from '../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../app/apiQueries'
import { buttonClass, cx, noticeClass, ui } from '../shared/ui'
import { AbilityBlock } from './conversation-setup/AbilityBlock'
import { NarrativeBlock } from './conversation-setup/NarrativeBlock'
import { PlayerBlock } from './conversation-setup/PlayerBlock'
import { ProviderBlock } from './conversation-setup/ProviderBlock'
import { SceneBlock } from './conversation-setup/SceneBlock'
import type { ConversationDraft } from './conversation-setup/types'

const narrativeDefaults: NarrativePreferences = {
  perspective: 'second_player',
  viewpointCharacterId: null,
  tense: 'present',
  length: 'balanced',
  targetWords: 800,
  dialogueDensity: 'balanced',
}

function restoreTargetWords(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return narrativeDefaults.targetWords
  return Math.min(3000, Math.max(100, Math.round(numeric)))
}

function restoreNarrative(value: unknown, story: StoryDetail): NarrativePreferences {
  if (!value || typeof value !== 'object') return { ...narrativeDefaults }
  const raw = value as Partial<NarrativePreferences>
  const perspectives = new Set<NarrativePreferences['perspective']>([
    'first_player',
    'second_player',
    'third_player',
    'first_character',
    'third_character',
    'third_omniscient',
  ])
  const perspective =
    raw.perspective && perspectives.has(raw.perspective) ? raw.perspective : narrativeDefaults.perspective
  const characterIds = new Set(story.characters.map((character) => character.id))
  const needsCharacter = perspective === 'first_character' || perspective === 'third_character'
  return {
    perspective: needsCharacter && story.characters.length === 0 ? 'second_player' : perspective,
    viewpointCharacterId: needsCharacter
      ? raw.viewpointCharacterId && characterIds.has(raw.viewpointCharacterId)
        ? raw.viewpointCharacterId
        : story.characters[0]?.id || null
      : null,
    tense: raw.tense === 'past' ? 'past' : 'present',
    length: raw.length === 'compact' || raw.length === 'expanded' ? raw.length : 'balanced',
    targetWords: restoreTargetWords(raw.targetWords),
    dialogueDensity: raw.dialogueDensity === 'low' || raw.dialogueDensity === 'high' ? raw.dialogueDensity : 'balanced',
  }
}

export function ConversationSetupPage() {
  const { storyId } = useParams({ from: '/stories/$storyId_/conversations/new' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const storageKey = `conversation-draft:${storyId}`
  const initializedStoryRef = useRef<string | null>(null)
  const [draft, setDraft] = useState<ConversationDraft>({
    title: '',
    sceneId: '',
    name: '',
    pronouns: '不限定',
    note: '',
    abilityIds: [],
    providerId: '',
    narrative: { ...narrativeDefaults },
  })
  const [actionError, setActionError] = useState('')
  const storyContract = apiContracts.story(storyId)
  const providersContract = apiContracts.providers()
  const storyQuery = useQuery(apiQueryOptions(storyContract, 5 * 60_000))
  const providersQuery = useQuery(apiQueryOptions(providersContract))
  const healthQuery = useQuery({
    ...apiQueryOptions(apiContracts.providerHealth(draft.providerId), 15_000),
    enabled: Boolean(draft.providerId),
  })
  const story = storyQuery.data?.story
  const providers = providersQuery.data?.providers || []
  const providerHealth =
    healthQuery.data?.health ||
    (healthQuery.error ? { online: false, model: '当前模型', models: [], reason: healthQuery.error.message } : null)
  const queryError = storyQuery.error || providersQuery.error
  const error = actionError || (queryError instanceof Error ? queryError.message : '')

  const createConversationMutation = useMutation({
    mutationFn: (payload: unknown) => post(apiContracts.createConversation(storyId), payload),
    onSuccess: async ({ conversation }) => {
      localStorage.removeItem(storageKey)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKey(apiContracts.storyConversations(storyId)), exact: true }),
        queryClient.invalidateQueries({ queryKey: apiQueryKey(apiContracts.stories()), exact: true }),
      ])
      navigate({ to: '/conversations/$conversationId', params: { conversationId: conversation.id } })
    },
  })

  useEffect(() => {
    if (!story || !providersQuery.data || initializedStoryRef.current === storyId) return
    initializedStoryRef.current = storyId
    const defaultProviderId = providers.find((provider) => provider.isDefault)?.id || providers[0]?.id || ''
    const defaults: ConversationDraft = {
      title: `${story.title} · 新存档`,
      sceneId: story.scenes.find((scene) => scene.isDefault)?.id || story.scenes[0]?.id || '',
      name: story.playerTemplate.defaultValues.name || '',
      pronouns: story.playerTemplate.defaultValues.pronouns || '不限定',
      note: story.playerTemplate.defaultValues.note || '',
      abilityIds: story.abilities.filter((ability) => ability.enabledByDefault).map((ability) => ability.id),
      providerId: defaultProviderId,
      narrative: { ...narrativeDefaults },
    }
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<ConversationDraft>
        const sceneIds = new Set(story.scenes.map((scene) => scene.id))
        const abilityIds = new Set(story.abilities.map((ability) => ability.id))
        const providerIds = new Set(providers.map((provider) => provider.id))
        setDraft({
          ...defaults,
          title: typeof parsed.title === 'string' ? parsed.title : defaults.title,
          sceneId: parsed.sceneId && sceneIds.has(parsed.sceneId) ? parsed.sceneId : defaults.sceneId,
          name: typeof parsed.name === 'string' ? parsed.name : defaults.name,
          pronouns: typeof parsed.pronouns === 'string' ? parsed.pronouns : defaults.pronouns,
          note: typeof parsed.note === 'string' ? parsed.note : defaults.note,
          abilityIds: Array.isArray(parsed.abilityIds)
            ? parsed.abilityIds.filter((id) => abilityIds.has(id))
            : defaults.abilityIds,
          providerId: parsed.providerId && providerIds.has(parsed.providerId) ? parsed.providerId : defaults.providerId,
          narrative: restoreNarrative(parsed.narrative, story),
        })
        return
      } catch {
        localStorage.removeItem(storageKey)
      }
    }
    setDraft(defaults)
  }, [providers, providersQuery.data, storageKey, story, storyId])

  useEffect(() => {
    if (story) localStorage.setItem(storageKey, JSON.stringify(draft))
  }, [draft, storageKey, story])

  function toggleAbility(id: string) {
    setDraft((current) => ({
      ...current,
      abilityIds: current.abilityIds.includes(id)
        ? current.abilityIds.filter((item) => item !== id)
        : [...current.abilityIds, id],
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setActionError('')
    try {
      const payload = createConversationSchema.parse({
        title: draft.title,
        sceneId: draft.sceneId || undefined,
        providerId: draft.providerId || undefined,
        player: { name: draft.name, pronouns: draft.pronouns, note: draft.note },
        abilityIds: draft.abilityIds,
        narrative: draft.narrative,
      })
      await createConversationMutation.mutateAsync(payload)
    } catch (reason) {
      setActionError(getSchemaErrorMessage(reason, '创建存档失败'))
    }
  }

  if (!story)
    return <div className={cx(ui.page, 'grid min-h-64 place-items-center text-muted')}>{error || '正在载入配置…'}</div>

  return (
    <div className={cx(ui.page, ui.narrowPage, 'pt-[34px]')}>
      <Link className={ui.backLink} to="/stories/$storyId" params={{ storyId: story.id }}>
        <ArrowLeft size={17} /> {story.title}
      </Link>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-5 py-[38px] pb-11 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-7">
        <img
          className="aspect-[3/4] w-[72px] rounded-[5px] object-cover shadow-[0_10px_24px_rgba(24,32,29,0.17)] sm:w-[92px]"
          src={story.cover}
          alt=""
        />
        <div>
          <p className={ui.sectionKicker}>新建独立存档</p>
          <h1 className="my-2 font-serif text-[clamp(1.8rem,7vw,2.375rem)] leading-[1.2] font-bold sm:mb-[11px]">
            设置你的进入方式
          </h1>
          <p className="m-0 text-sm text-muted sm:text-base">故事设定会在创建时固定下来，之后不受故事卡改动影响。</p>
        </div>
      </div>

      <form onSubmit={submit}>
        <SceneBlock story={story} draft={draft} onChange={setDraft} />
        <PlayerBlock story={story} draft={draft} onChange={setDraft} />
        <AbilityBlock abilities={story.abilities} selectedIds={draft.abilityIds} onToggle={toggleAbility} />
        <NarrativeBlock story={story} draft={draft} onChange={setDraft} />
        <ProviderBlock
          providers={providers}
          draft={draft}
          health={providerHealth}
          checking={healthQuery.isFetching}
          onChange={setDraft}
        />
        {error && <div className={noticeClass(true)}>{error}</div>}
        <div className="flex items-center justify-between gap-5 pt-[22px]">
          <span className="text-xs text-muted">配置已自动保存在浏览器中</span>
          <button
            className={buttonClass('primary')}
            disabled={createConversationMutation.isPending || providers.length === 0}
            type="submit"
          >
            {createConversationMutation.isPending ? '正在创建…' : '进入故事'}{' '}
            {!createConversationMutation.isPending && <ArrowRight size={18} />}
          </button>
        </div>
      </form>
    </div>
  )
}
