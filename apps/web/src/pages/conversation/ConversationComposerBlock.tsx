import type { InputMode, StoryMessage } from '@storybound/shared'
import { Pencil, Send, Square, X } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'
import { cx } from '../../shared/ui'
import { modeLabels } from './constants'

interface ConversationComposerBlockProps {
  readOnly: boolean
  editing: StoryMessage | null
  mode: InputMode
  draft: string
  generationId: string | null
  onSubmit: (event: FormEvent) => void
  onCancelEdit: () => void
  onModeChange: (mode: InputMode) => void
  onDraftChange: (draft: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onStop: () => void
}

export function ConversationComposerBlock({
  readOnly,
  editing,
  mode,
  draft,
  generationId,
  onSubmit,
  onCancelEdit,
  onModeChange,
  onDraftChange,
  onKeyDown,
  onStop,
}: ConversationComposerBlockProps) {
  return (
    <form
      className={cx(
        'mx-auto mb-[18px] w-[calc(100%-1.5rem)] max-w-[790px] shrink-0 rounded-[7px] border border-[#bfc9c2] bg-surface p-[9px] shadow-[0_13px_34px_rgba(25,34,29,0.13)] focus-within:border-[#7f9d8d] focus-within:shadow-[0_0_0_3px_rgba(33,98,72,0.08),0_13px_34px_rgba(25,34,29,0.13)] sm:w-[calc(100%-3rem)]',
        readOnly && 'border-line opacity-70 shadow-none focus-within:border-line focus-within:shadow-none',
      )}
      onSubmit={onSubmit}
    >
      {editing && (
        <div className="-mx-[9px] -mt-[9px] mb-2 flex min-h-[30px] items-center gap-1.5 border-b border-[#ddceb7] bg-[#eee4d4] px-[9px] py-1 text-[11px] text-[#6e5940]">
          <Pencil size={14} /> 正在编辑最后一条玩家消息
          <button
            className="ml-auto grid h-[26px] w-7 cursor-pointer place-items-center border-0 bg-transparent"
            type="button"
            onClick={onCancelEdit}
            aria-label="取消编辑"
            title="取消编辑"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex h-7 gap-[3px]" role="group" aria-label="输入模式">
        {(Object.keys(modeLabels) as InputMode[]).map((value) => (
          <button
            type="button"
            className={cx(
              'min-w-12 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 text-[11px] text-muted',
              mode === value && 'bg-green-soft font-bold text-green',
            )}
            onClick={() => onModeChange(value)}
            key={value}
          >
            {modeLabels[value]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_38px] items-end gap-2">
        <textarea
          className="max-h-[140px] min-h-12 w-full resize-none border-0 bg-transparent px-[7px] pt-2 pb-[5px] leading-[1.55] outline-none"
          rows={2}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={readOnly}
          placeholder={
            readOnly
              ? '存档已归档'
              : mode === 'dialogue'
                ? '说些什么…'
                : mode === 'action'
                  ? '描述你的行动…'
                  : '补充场景或时间变化…'
          }
        />
        {generationId ? (
          <button
            type="button"
            className="grid size-[38px] cursor-pointer place-items-center rounded-[5px] border-0 bg-red text-white shadow-[0_4px_11px_rgba(33,98,72,0.2)]"
            onClick={onStop}
            title="停止生成"
            aria-label="停止生成"
          >
            <Square size={17} />
          </button>
        ) : (
          <button
            type="submit"
            className="grid size-[38px] cursor-pointer place-items-center rounded-[5px] border-0 bg-green text-white shadow-[0_4px_11px_rgba(33,98,72,0.2)] disabled:cursor-default disabled:opacity-35"
            disabled={readOnly || !draft.trim()}
            title="发送"
            aria-label="发送"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </form>
  )
}
