import type { Conversation, ConversationEvent, ReplyCandidate, StoryMessage } from '@storybound/shared'
import { ArrowDown, Bookmark, Check, Copy, GitBranch, Pencil, Puzzle, RefreshCw, RotateCcw } from 'lucide-react'
import { Fragment, type Ref, useMemo } from 'react'
import { buttonClass, cx, noticeClass } from '../../shared/ui'
import { modeLabels } from './constants'

const messageActionClass =
  'inline-flex min-h-[25px] cursor-pointer items-center gap-[5px] border-0 bg-transparent px-[7px] text-[11px] text-muted hover:bg-[#e4e3dd] hover:text-ink disabled:cursor-default disabled:opacity-50'

interface ConversationTimelineBlockProps {
  conversation: Conversation
  timelineRef: Ref<HTMLDivElement>
  generationId: string | null
  streamingText: string
  loadingOlder: boolean
  waitingForRetry: boolean
  showLatest: boolean
  error: string
  selectingCandidateId: string | null
  onScroll: () => void
  onLoadOlder: () => void
  onScrollLatest: () => void
  onToggleMemory: (message: StoryMessage) => void
  onBeginEdit: (message: StoryMessage) => void
  onRegenerate: () => void
  onSelectCandidate: (candidate: ReplyCandidate) => void
  onRetry: () => void
  onFork: (message: StoryMessage) => void
}

function eventText(event: ConversationEvent): [string, string | undefined] {
  if (event.kind === 'mod_enabled') return ['启用 MOD', event.payload.modName]
  if (event.kind === 'mod_disabled') return ['停用 MOD', event.payload.modName]
  if (event.kind === 'mod_configured') return ['调整 MOD', event.payload.modName]
  if (event.kind === 'memory_pinned') return ['固定记忆', event.payload.summary]
  if (event.kind === 'memory_unpinned') return ['取消记忆', event.payload.summary]
  if (event.kind === 'chapter_closed') return ['结束章节', event.payload.title]
  if (event.kind === 'state_updated') return ['更新状态', event.payload.title || '自定义状态']
  if (event.kind === 'ability_used') return ['使用能力', event.payload.abilityName]
  if (event.kind === 'state_suggestion_created') return ['记录状态建议', event.payload.title]
  if (event.kind === 'state_suggestion_accepted') return ['接受状态建议', event.payload.title]
  if (event.kind === 'state_suggestion_rejected') return ['拒绝状态建议', event.payload.title]
  if (event.kind === 'node_progress_updated') return ['更新故事节点', event.payload.nodeTitle]
  if (event.kind === 'conversation_forked')
    return [
      '派生存档',
      event.payload.title ||
        (event.payload.childConversationId ? String(event.payload.childConversationId) : undefined),
    ]
  return ['时间线事件', String(event.kind)]
}

export function ConversationTimelineBlock({
  conversation,
  timelineRef,
  generationId,
  streamingText,
  loadingOlder,
  waitingForRetry,
  showLatest,
  error,
  selectingCandidateId,
  onScroll,
  onLoadOlder,
  onScrollLatest,
  onToggleMemory,
  onBeginEdit,
  onRegenerate,
  onSelectCandidate,
  onRetry,
  onFork,
}: ConversationTimelineBlockProps) {
  const readOnly = conversation.status !== 'active'
  const lastMessage = conversation.messages.at(-1)
  const lastPlayerId = lastMessage?.sender === 'player' ? lastMessage.id : lastMessage?.parentMessageId
  const replyCandidates = conversation.replyCandidates || []
  const characters = useMemo(
    () => new Map(conversation.story.characters.map((character) => [character.id, character])),
    [conversation.story.characters],
  )
  const eventsByMessage = useMemo(() => {
    const result = new Map<string, ConversationEvent[]>()
    for (const event of conversation.events) {
      if (!event.anchorMessageId) continue
      const current = result.get(event.anchorMessageId) || []
      current.push(event)
      result.set(event.anchorMessageId, current)
    }
    return result
  }, [conversation.events])
  const pinnedMessageIds = useMemo(
    () => new Set(conversation.state.custom?.pinnedMemories?.map((item) => item.messageId) || []),
    [conversation.state.custom?.pinnedMemories],
  )

  return (
    <>
      <div
        className="min-h-0 flex-1 scroll-smooth overflow-y-auto px-[max(1rem,calc((100%-760px)/2))] pt-[34px] pb-[30px] [scrollbar-color:#bdc7c0_transparent] sm:px-[max(28px,calc((100%-760px)/2))]"
        ref={timelineRef}
        onScroll={onScroll}
      >
        {conversation.messagePage.hasMore && (
          <button
            className="mx-auto mb-[22px] block min-h-[30px] cursor-pointer rounded border border-line bg-surface px-[11px] text-[10px] text-muted disabled:cursor-default disabled:opacity-55"
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? '正在加载…' : '加载更早内容'}
          </button>
        )}
        <div className="mt-0.5 mb-[34px] flex items-center gap-3 text-muted after:h-px after:flex-1 after:bg-line after:content-['']">
          <span className="font-mono text-[11px] leading-none font-semibold text-red">
            {conversation.currentChapter?.title || '第一章'}
          </span>
          <strong className="font-serif text-[13px] leading-none font-semibold">{conversation.scene.title}</strong>
        </div>
        {conversation.messages.map((message, index) => {
          const isPlayer = message.sender === 'player'
          const character = message.characterId ? characters.get(message.characterId) : null
          const isLastPlayer = message.id === lastPlayerId && lastMessage?.sender !== 'player'
          const anchoredEvents = eventsByMessage.get(message.id) || []
          return (
            <Fragment key={message.id}>
              <article
                className={cx(
                  'group/message mb-[27px] max-w-[700px] [contain-intrinsic-size:auto_180px] [content-visibility:auto]',
                  isPlayer ? 'ml-auto max-w-[88%] sm:max-w-[76%]' : 'mr-auto',
                )}
              >
                <header
                  className={cx(
                    'mb-[5px] flex min-h-[21px] items-center gap-2 text-[11px] text-muted',
                    isPlayer && 'justify-end',
                  )}
                >
                  <span>{isPlayer ? conversation.player.name : character?.name || '旁白'}</span>
                  {isPlayer && message.inputMode && (
                    <em className="rounded-sm bg-[#e0dfd9] px-[5px] py-0.5 not-italic">
                      {modeLabels[message.inputMode]}
                    </em>
                  )}
                </header>
                <div
                  className={cx(
                    'text-sm leading-[1.9] whitespace-pre-wrap [overflow-wrap:anywhere]',
                    isPlayer
                      ? 'rounded-[7px_7px_2px_7px] border border-[#c9dbd0] bg-[#e0ebe4] px-[15px] py-3 shadow-[0_2px_7px_rgba(33,98,72,0.05)]'
                      : 'border-l-2 border-gold pl-[17px] font-serif',
                  )}
                >
                  {message.content}
                </div>
                <div
                  className={cx(
                    'mt-[5px] flex min-h-[25px] items-center gap-[5px] opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100',
                    isPlayer && 'justify-end',
                  )}
                >
                  <button
                    type="button"
                    className={messageActionClass}
                    title="复制"
                    onClick={() => void navigator.clipboard.writeText(message.content)}
                  >
                    <Copy size={14} /> 复制
                  </button>
                  <button
                    type="button"
                    className={cx(messageActionClass, pinnedMessageIds.has(message.id) && 'bg-green-soft text-green')}
                    title={pinnedMessageIds.has(message.id) ? '取消固定记忆' : '固定为记忆'}
                    disabled={readOnly || Boolean(generationId)}
                    onClick={() => onToggleMemory(message)}
                  >
                    <Bookmark size={14} /> {pinnedMessageIds.has(message.id) ? '已记忆' : '记忆'}
                  </button>
                  {!readOnly && isLastPlayer && (
                    <button
                      type="button"
                      className={messageActionClass}
                      title="编辑后重试"
                      onClick={() => onBeginEdit(message)}
                    >
                      <Pencil size={14} /> 编辑重试
                    </button>
                  )}
                  {!readOnly && !isPlayer && index === conversation.messages.length - 1 && !generationId && (
                    <button type="button" className={messageActionClass} title="重新生成" onClick={onRegenerate}>
                      <RefreshCw size={14} /> 重新生成
                    </button>
                  )}
                  <button
                    type="button"
                    className={messageActionClass}
                    title="从这里派生新存档"
                    disabled={Boolean(generationId)}
                    onClick={() => onFork(message)}
                  >
                    <GitBranch size={14} /> 派生
                  </button>
                </div>
                {!isPlayer && message.id === conversation.activeLeafMessageId && replyCandidates.length > 1 && (
                  <div className="mt-[9px] ml-[17px] grid gap-2 rounded-[5px] border border-[#d7d3c6] bg-[#f6f4ee] p-[9px]">
                    <header className="m-0 flex min-h-[18px] items-center gap-1.5 text-[10px] text-[#6c6251]">
                      <GitBranch size={13} />
                      <span className="font-bold">候选回复</span>
                      <strong className="ml-auto font-mono text-[10px] leading-none font-semibold text-[#7e6842]">
                        {replyCandidates.findIndex((candidate) => candidate.isActive) + 1}/{replyCandidates.length}
                      </strong>
                    </header>
                    <div className="flex flex-wrap gap-1.5">
                      {replyCandidates.map((candidate, candidateIndex) => {
                        const disabled =
                          readOnly ||
                          Boolean(generationId) ||
                          selectingCandidateId !== null ||
                          !candidate.selectable ||
                          candidate.isActive
                        const title = candidate.isActive
                          ? '当前采用版本'
                          : candidate.blockedReason === 'HAS_CONTINUATION'
                            ? '已继续推进，不能直接切换'
                            : '采用这个回复'
                        return (
                          <button
                            className={cx(
                              'grid min-h-[34px] min-w-[94px] cursor-pointer justify-items-start gap-0.5 rounded border border-[#d2cbbc] bg-surface px-[9px] py-[5px] text-[#5b554b] hover:not-disabled:border-[#b7aa91] hover:not-disabled:bg-[#fffaf0] disabled:cursor-default disabled:opacity-55',
                              candidate.isActive &&
                                'cursor-default border-[#b9cbc1] bg-green-soft text-green opacity-100',
                            )}
                            type="button"
                            disabled={disabled}
                            key={candidate.id}
                            title={title}
                            onClick={() => onSelectCandidate(candidate)}
                          >
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                              {candidate.isActive && <Check size={12} />} 版本 {candidateIndex + 1}
                            </span>
                            <small className="text-[9px] text-muted">
                              {candidate.attempt ? `第 ${candidate.attempt} 次` : candidate.model || '候选'}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </article>
              {anchoredEvents.map((event) => {
                const [label, value] = eventText(event)
                return (
                  <div
                    className="mx-auto -mt-3 mb-[25px] flex min-h-8 max-w-[700px] items-center justify-center gap-1.5 text-[10px] text-[#596b78] [contain-intrinsic-size:auto_32px] [content-visibility:auto] before:h-px before:flex-1 before:bg-[#ccd6db] before:content-[''] after:h-px after:flex-1 after:bg-[#ccd6db] after:content-['']"
                    key={event.id}
                  >
                    <Puzzle size={13} />
                    <span>{label}</span>
                    {value && (
                      <strong className="max-w-[280px] truncate font-bold text-[#405865]">{String(value)}</strong>
                    )}
                  </div>
                )
              })}
            </Fragment>
          )
        })}
        {streamingText && (
          <article className="mr-auto mb-[27px] max-w-[700px]">
            <header className="mb-[5px] flex min-h-[21px] items-center gap-2 text-[11px] text-muted">
              <span>正在续写</span>
            </header>
            <div className="min-h-8 border-l-2 border-gold pl-[17px] font-serif text-sm leading-[1.9] whitespace-pre-wrap [overflow-wrap:anywhere]">
              {streamingText}
              <i className="ml-[3px] inline-block h-[15px] w-[7px] animate-pulse bg-red align-middle" />
            </div>
          </article>
        )}
        {waitingForRetry && (
          <div className="-mt-[5px] mb-6 ml-auto flex max-w-[690px] items-center justify-between gap-3.5 border border-dashed border-[#c6a79f] bg-[#f1e5e1] px-3 py-[11px] text-xs text-[#70473f]">
            <span>这条输入已保存，但还没有人物回复。</span>
            <button type="button" className={buttonClass('secondary')} onClick={onRetry}>
              <RotateCcw size={16} /> 重试
            </button>
          </div>
        )}
        {error && <div className={noticeClass(true, 'mx-auto mt-2 mb-5 max-w-[690px]')}>{error}</div>}
      </div>
      {showLatest && (
        <button
          className="absolute right-3 bottom-[130px] inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded border border-line bg-surface px-[11px] text-[11px] text-muted shadow-[0_6px_20px_rgba(31,35,32,0.12)] hover:border-[#aaada7] hover:text-ink sm:right-[22px]"
          type="button"
          onClick={onScrollLatest}
        >
          <ArrowDown size={15} /> 回到最新
        </button>
      )}
    </>
  )
}
