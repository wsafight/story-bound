import type { Conversation } from '@storybound/shared'
import { BookOpen, BookOpenCheck, Check, MapPin, Pencil, Sparkles, X } from 'lucide-react'
import { buttonClass, cx, ui } from '../../shared/ui'

interface ConversationSidebarBlockProps {
  conversation: Conversation
  readOnly: boolean
  generationId: string | null
  onAbility: (abilityId: string) => void
  onEditState: () => void
  onCreateSuggestion: () => void
  onResolveSuggestion: (suggestionId: string, accept: boolean) => void
  onChapter: () => void
}

export function ConversationSidebarBlock({
  conversation,
  readOnly,
  generationId,
  onAbility,
  onEditState,
  onCreateSuggestion,
  onResolveSuggestion,
  onChapter,
}: ConversationSidebarBlockProps) {
  const customState = conversation.state.custom || {}
  const appManagedKeys = new Set([
    'pinnedMemories',
    'chapterSummaries',
    'abilityUses',
    'stateSuggestions',
    'nodeProgress',
  ])
  const storyStateEntries = Object.entries(customState).filter(([key]) => !appManagedKeys.has(key))
  const pendingSuggestions = (customState.stateSuggestions || []).filter((item) => item.status === 'pending')

  return (
    <aside className="hidden min-h-0 min-w-0 overflow-y-auto border-l border-line bg-[#e8ede9] lg:block">
      <div className="relative h-[180px] overflow-hidden bg-[#303733]">
        <img className="size-full object-cover" src={conversation.story.cover} alt="" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(14,17,15,0.7),transparent_60%)]" />
        <div className="absolute right-[15px] bottom-3 left-[15px] z-[1] flex items-center gap-[7px] text-xs text-white">
          <BookOpen size={17} />
          <span>{conversation.state.phase || '故事开始'}</span>
        </div>
      </div>
      <section className="border-b border-[#d1d9d3] p-[18px]">
        <h2 className="mt-0 mb-3 text-[11px] text-muted uppercase">当前现场</h2>
        <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-[7px] text-xs">
          <dt className="flex items-center gap-1 text-muted">
            <MapPin size={14} /> 地点
          </dt>
          <dd className="m-0 min-w-0 text-right [overflow-wrap:anywhere]">
            {conversation.state.scene?.location || conversation.scene.location}
          </dd>
          <dt className="text-muted">时间</dt>
          <dd className="m-0 min-w-0 text-right [overflow-wrap:anywhere]">
            {conversation.state.scene?.time || conversation.scene.time}
          </dd>
        </dl>
      </section>
      <section className="border-b border-[#d1d9d3] p-[18px]">
        <h2 className="mt-0 mb-3 text-[11px] text-muted uppercase">玩家档案</h2>
        <strong className="font-serif">{conversation.player.name}</strong>
        <p className="mt-[3px] mb-2 text-xs text-green">{conversation.player.roleName}</p>
        <small className="block leading-[1.6] text-muted [overflow-wrap:anywhere]">{conversation.player.goals}</small>
      </section>
      <section className="border-b border-[#d1d9d3] p-[18px]">
        <h2 className="mt-0 mb-3 text-[11px] text-muted uppercase">已启用能力</h2>
        <div className="flex flex-wrap gap-1.5">
          {conversation.abilities.map((ability) => (
            <button
              className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-[3px] border border-transparent bg-[#d8e0da] px-[7px] py-[5px] text-[11px] text-[#4f5f54] hover:not-disabled:border-[#9eb2a5] hover:not-disabled:bg-[#d0ddd4] disabled:cursor-default disabled:opacity-55"
              type="button"
              key={ability.id}
              disabled={readOnly || Boolean(generationId)}
              onClick={() => onAbility(ability.id)}
              title={`使用${ability.name}`}
            >
              <Sparkles size={13} /> {ability.name}
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-3 border-b border-[#d1d9d3] p-[18px]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[11px] text-muted uppercase">故事状态</h2>
          <button
            className={ui.iconButton}
            type="button"
            disabled={readOnly || Boolean(generationId)}
            onClick={onEditState}
            title="编辑状态补丁"
            aria-label="编辑状态补丁"
          >
            <Pencil size={14} />
          </button>
        </div>
        {storyStateEntries.length === 0 ? (
          <small className="leading-[1.6] text-muted">当前没有作者自定义状态。</small>
        ) : (
          <dl className="m-0 grid gap-1.5 text-xs">
            {storyStateEntries.slice(0, 8).map(([key, value]) => (
              <div className="grid grid-cols-[90px_1fr] gap-2" key={key}>
                <dt className="truncate text-muted">{key}</dt>
                <dd className="m-0 truncate text-right">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <button
          className={buttonClass('secondary', 'w-full')}
          type="button"
          disabled={readOnly || Boolean(generationId)}
          onClick={onCreateSuggestion}
        >
          <Sparkles size={14} /> 记录状态建议
        </button>
        {pendingSuggestions.length > 0 && (
          <div className="grid gap-2">
            {pendingSuggestions.map((suggestion) => (
              <div className="rounded border border-[#cfd8d1] bg-surface p-2.5" key={suggestion.id}>
                <strong className="block text-xs">{suggestion.title}</strong>
                {suggestion.summary && <small className="block leading-[1.5] text-muted">{suggestion.summary}</small>}
                <div className="mt-2 flex gap-1">
                  <button
                    className={cx(ui.iconButton, 'size-7 bg-green-soft text-green')}
                    type="button"
                    disabled={readOnly || Boolean(generationId)}
                    onClick={() => onResolveSuggestion(suggestion.id, true)}
                    title="接受建议"
                    aria-label="接受建议"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    className={cx(ui.iconButton, 'size-7 bg-red-soft text-red')}
                    type="button"
                    disabled={readOnly || Boolean(generationId)}
                    onClick={() => onResolveSuggestion(suggestion.id, false)}
                    title="拒绝建议"
                    aria-label="拒绝建议"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="grid gap-2 border-b border-[#d1d9d3] p-[18px]">
        <h2 className="m-0 text-[11px] text-muted uppercase">章节与记忆</h2>
        <p className="m-0 text-xs text-green">{conversation.currentChapter?.title || '第一章'}</p>
        <small className="leading-[1.6] text-muted">
          {conversation.state.custom?.pinnedMemories?.length || 0} 条固定记忆 ·{' '}
          {conversation.state.custom?.chapterSummaries?.length || 0} 篇回顾
        </small>
        <button
          className={buttonClass('secondary', 'mt-1.5 w-full')}
          type="button"
          disabled={readOnly || Boolean(generationId)}
          onClick={onChapter}
        >
          <BookOpenCheck size={14} /> 结束本章
        </button>
      </section>
    </aside>
  )
}
