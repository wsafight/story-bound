import { apiContracts, apiPaths, type ConversationListItem } from '@storybound/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Clock3,
  Copy,
  Download,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { api, downloadApi, post } from '../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../app/apiQueries'
import { usePromptDialog } from '../components/PromptDialog'
import { buttonClass, cx, emptyStateClass, noticeClass, ui } from '../shared/ui'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  )
}

export function StoryDetailPage() {
  const { storyId } = useParams({ from: '/stories/$storyId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')
  const storyContract = apiContracts.story(storyId)
  const conversationsContract = apiContracts.storyConversations(storyId)
  const storiesContract = apiContracts.stories()
  const storyQuery = useQuery(apiQueryOptions(storyContract, 5 * 60_000))
  const conversationsQuery = useQuery(apiQueryOptions(conversationsContract))
  const story = storyQuery.data?.story
  const conversations = conversationsQuery.data?.conversations || []
  const queryError = storyQuery.error || conversationsQuery.error
  const error = actionError || (queryError instanceof Error ? queryError.message : '')
  const { promptText, promptDialog } = usePromptDialog()

  const duplicateMutation = useMutation({
    mutationFn: () => post(apiContracts.duplicateStory(storyId)),
    onSuccess: async ({ story: duplicatedStory }) => {
      await queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      navigate({ to: '/stories/$storyId/edit', params: { storyId: duplicatedStory.id } })
    },
  })
  const updateConversationMutation = useMutation({
    mutationFn: ({ conversationId, body }: { conversationId: string; body: { title?: string; status?: string } }) =>
      api(apiContracts.updateConversation(conversationId), {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: ({ conversation: updatedConversation }) => {
      queryClient.setQueryData<{ conversations: ConversationListItem[] }>(
        apiQueryKey(conversationsContract),
        (current) =>
          current
            ? {
                conversations: current.conversations.map((item) =>
                  item.id === updatedConversation.id ? { ...item, ...updatedConversation } : item,
                ),
              }
            : current,
      )
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(storiesContract), exact: true })
      void queryClient.invalidateQueries({
        queryKey: apiQueryKey(apiContracts.conversation(updatedConversation.id)),
        exact: true,
      })
    },
  })

  if (error)
    return (
      <div className={ui.page}>
        <div className={noticeClass(true)}>{error}</div>
      </div>
    )
  if (!story) return <div className={cx(ui.page, 'grid min-h-64 place-items-center text-muted')}>正在打开故事…</div>

  const recent = conversations.find((conversation) => conversation.status === 'active')
  async function duplicate() {
    setActionError('')
    try {
      await duplicateMutation.mutateAsync()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '复制失败')
    }
  }
  async function renameConversation(conversation: ConversationListItem) {
    const title = await promptText({ title: '修改存档名称', initialValue: conversation.title, maxLength: 80 })
    if (!title || title === conversation.title) return
    setActionError('')
    try {
      await updateConversationMutation.mutateAsync({ conversationId: conversation.id, body: { title } })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '存档重命名失败')
    }
  }

  async function toggleArchive(conversation: ConversationListItem) {
    const archived = conversation.status === 'archived'
    setActionError('')
    try {
      await updateConversationMutation.mutateAsync({
        conversationId: conversation.id,
        body: { status: archived ? 'active' : 'archived' },
      })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '存档状态更新失败')
    }
  }

  async function exportStory() {
    if (!story) return
    setActionError('')
    try {
      await downloadApi(apiPaths.exportStory(story.id), `${story.title || 'story'}.storybound.json`)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '故事卡导出失败')
    }
  }

  return (
    <div>
      <section className="relative h-[min(680px,calc(100vh-105px))] min-h-[510px] overflow-hidden bg-[#202522] text-white">
        <img className="size-full object-cover object-[center_48%]" src={story.cover} alt={`${story.title}封面`} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,18,16,0.88)_0%,rgba(14,18,16,0.64)_42%,rgba(14,18,16,0.15)_76%),linear-gradient(0deg,rgba(14,18,16,0.56),transparent_48%)]" />
        <div className="absolute inset-0 mx-auto flex w-[calc(100%-2rem)] max-w-[1240px] flex-col py-[30px] pb-[62px] sm:w-[calc(100%-4rem)]">
          <Link className={cx(ui.backLink, 'text-white/80')} to="/">
            <ArrowLeft size={17} /> 故事库
          </Link>
          <div className="mt-auto w-full max-w-[660px] sm:w-3/4">
            <div className="flex flex-wrap gap-[7px]">
              {story.tags.map((tag) => (
                <span
                  className="rounded-[3px] border border-white/20 bg-[#121815]/35 px-2 py-1 text-[10px] text-white backdrop-blur-lg"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="mt-3.5 mb-4 font-serif text-[clamp(2.5rem,10vw,3.625rem)] leading-[1.16] font-bold">
              {story.title}
            </h1>
            <p className="m-0 max-w-[650px] text-base leading-[1.9] text-white/85">{story.description}</p>
            <div className="mt-[26px] flex flex-wrap gap-2.5">
              <Link
                className={buttonClass('primary')}
                to="/stories/$storyId/conversations/new"
                params={{ storyId: story.id }}
              >
                <Plus size={18} /> 新建存档
              </Link>
              {recent && (
                <Link
                  className={buttonClass('glass')}
                  to="/conversations/$conversationId"
                  params={{ conversationId: recent.id }}
                >
                  <Play size={17} /> 继续最近存档
                </Link>
              )}
              {story.isBuiltin ? (
                <button
                  className={buttonClass('glass')}
                  type="button"
                  onClick={() => void duplicate()}
                  disabled={duplicateMutation.isPending}
                >
                  <Copy size={16} /> 复制并编辑
                </button>
              ) : (
                <Link className={buttonClass('glass')} to="/stories/$storyId/edit" params={{ storyId: story.id }}>
                  <Pencil size={16} /> 编辑故事
                </Link>
              )}
              <button className={buttonClass('glass')} type="button" onClick={() => void exportStory()}>
                <Download size={16} /> 导出故事
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-[calc(100%-2rem)] max-w-[1120px] sm:w-[calc(100%-4rem)]">
        <section className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] lg:gap-[72px] lg:py-[76px]">
          <div>
            <p className={ui.sectionKicker}>背景档案</p>
            <h2 className="mt-2 mb-[18px] font-serif text-[30px] leading-[1.4] font-bold">故事背景</h2>
            <p className="text-base leading-8 text-[#494f4b]">{story.background}</p>
          </div>
          <div className="self-start rounded-md border border-[#cddbe2] bg-blue-soft p-6">
            <div className="flex items-center gap-[9px] text-blue">
              <ShieldCheck size={19} />
              <h3 className="m-0 text-lg font-bold">叙事规则</h3>
            </div>
            <p className="leading-7 text-[#4c554f]">{story.worldRules}</p>
            <dl className="mt-5 grid grid-cols-[70px_1fr] gap-2 text-xs">
              <dt className="text-muted">内容提示</dt>
              <dd className="m-0">{story.contentWarnings.join('、')}</dd>
              <dt className="text-muted">内容边界</dt>
              <dd className="m-0">{story.contentBoundaries.join('；')}</dd>
            </dl>
          </div>
        </section>

        <section className="border-t border-line py-[68px]">
          <div className="mb-7 flex items-end justify-between">
            <div>
              <p className={ui.sectionKicker}>人物档案</p>
              <h2 className="mt-2 mb-0 font-serif text-[30px] leading-[1.4] font-bold">现场人物</h2>
            </div>
            <span className="text-[13px] text-muted">{story.characters.length} 人</span>
          </div>
          <div className="border-t border-line">
            {story.characters.map((character, index) => (
              <article
                className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-6 md:grid-cols-[50px_1.2fr_1.5fr_90px] md:gap-[22px]"
                key={character.id}
              >
                <span className="font-mono text-[13px] leading-none font-semibold text-gold">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="mt-0 mb-1 font-serif text-xl leading-[1.3] font-bold">{character.name}</h3>
                  <p className="m-0 text-[13px] leading-[1.65] text-muted">{character.identity}</p>
                </div>
                <p className="col-span-2 col-start-2 m-0 text-[13px] leading-[1.65] text-muted md:col-span-1 md:col-start-auto">
                  {character.personality}
                </p>
                <span className="col-start-3 row-start-1 justify-self-end text-xs text-green md:col-start-auto md:row-start-auto">
                  {character.roleType === 'main' ? '主要人物' : '关联人物'}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-10 border-t border-line py-[70px] md:grid-cols-2 md:gap-[72px]">
          <div className="min-w-0">
            <div className="flex items-center gap-[9px]">
              <UserRound size={19} />
              <h2 className="m-0 font-serif text-lg font-bold">推荐身份</h2>
            </div>
            <h3 className="mt-[22px] mb-2 text-lg font-bold">{story.playerTemplate.roleName}</h3>
            <p className="leading-7 text-[#505652]">{story.playerTemplate.background}</p>
            <p className="text-[13px] leading-7 text-muted">目标：{story.playerTemplate.goals}</p>
          </div>
          <div className="min-w-0 md:border-l md:border-line md:pl-[50px]">
            <div className="flex items-center gap-[9px]">
              <Sparkles size={19} />
              <h2 className="m-0 font-serif text-lg font-bold">可用能力</h2>
            </div>
            <div className="mt-5 grid gap-2">
              {story.abilities.map((ability) => (
                <div
                  className="grid grid-cols-[100px_1fr] gap-3 border-b border-line py-3 text-[13px]"
                  key={ability.id}
                >
                  <strong>{ability.name}</strong>
                  <span className="text-muted">{ability.description}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line py-[68px]">
          <div className="mb-7 flex items-end justify-between">
            <div>
              <p className={ui.sectionKicker}>本地进度</p>
              <h2 className="mt-2 mb-0 font-serif text-[30px] leading-[1.4] font-bold">已有存档</h2>
            </div>
            <Link
              className={buttonClass('secondary')}
              to="/stories/$storyId/conversations/new"
              params={{ storyId: story.id }}
            >
              <Plus size={17} /> 新建
            </Link>
          </div>
          {conversations.length ? (
            <div className="border-t border-line">
              {conversations.map((conversation) => (
                <article
                  className={cx(
                    'grid min-h-[74px] grid-cols-[minmax(0,1fr)_auto] items-center border-b border-line',
                    conversation.status === 'archived' && 'opacity-65',
                  )}
                  key={conversation.id}
                >
                  <Link
                    className="grid min-h-[73px] min-w-0 grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-3 px-2.5 transition-[background,padding] duration-150 hover:bg-white/70 hover:pl-3.5 sm:gap-5"
                    to="/conversations/$conversationId"
                    params={{ conversationId: conversation.id }}
                  >
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-[13px]">
                      <strong>{conversation.title}</strong>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {conversation.status === 'archived' ? '已归档' : conversation.state.phase || '故事开始'}
                      </span>
                    </div>
                    <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
                      <Clock3 size={14} /> {formatDate(conversation.updatedAt)}
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                  <div className="flex items-center gap-0.5 pr-1.5">
                    <button
                      className={ui.iconButton}
                      type="button"
                      onClick={() => void renameConversation(conversation)}
                      disabled={
                        updateConversationMutation.isPending &&
                        updateConversationMutation.variables?.conversationId === conversation.id
                      }
                      title="重命名存档"
                      aria-label="重命名存档"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className={ui.iconButton}
                      type="button"
                      onClick={() => void toggleArchive(conversation)}
                      disabled={
                        updateConversationMutation.isPending &&
                        updateConversationMutation.variables?.conversationId === conversation.id
                      }
                      title={conversation.status === 'archived' ? '恢复存档' : '归档存档'}
                      aria-label={conversation.status === 'archived' ? '恢复存档' : '归档存档'}
                    >
                      {conversation.status === 'archived' ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={emptyStateClass(true)}>还没有存档。从默认开场进入故事。</div>
          )}
        </section>
      </div>
      {promptDialog}
    </div>
  )
}
