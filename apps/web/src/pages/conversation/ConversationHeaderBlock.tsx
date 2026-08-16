import { apiPaths, type Conversation, type ModelHealth } from '@storybound/shared'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, BookOpenCheck, Download, FileSearch, Puzzle, Radar } from 'lucide-react'
import { downloadApi } from '../../app/apiClient'
import { cx, ui } from '../../shared/ui'

interface ConversationHeaderBlockProps {
  conversation: Conversation
  model: ModelHealth | null
  readOnly: boolean
  generationId: string | null
  onChapter: () => void
  onContext: () => void
  onDiagnostics: () => void
  onMods: () => void
  onError: (message: string) => void
}

export function ConversationHeaderBlock({
  conversation,
  model,
  readOnly,
  generationId,
  onChapter,
  onContext,
  onDiagnostics,
  onMods,
  onError,
}: ConversationHeaderBlockProps) {
  return (
    <header className="grid h-[58px] shrink-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line bg-white/95 px-2.5 sm:gap-3 sm:px-[22px]">
      <Link
        to="/stories/$storyId"
        params={{ storyId: conversation.story.id }}
        className={ui.iconButton}
        title="返回故事详情"
        aria-label="返回故事详情"
      >
        <ArrowLeft size={19} />
      </Link>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <strong className="min-w-0 truncate">{conversation.story.title}</strong>
        <span className="hidden truncate text-xs text-muted sm:block">{conversation.title}</span>
      </div>
      <div className="flex items-center justify-end gap-[3px]">
        <div className="mr-1.5 hidden min-w-[98px] items-center justify-end gap-[7px] text-[11px] whitespace-nowrap text-muted md:flex">
          <span
            className={cx(
              'size-[7px] rounded-full bg-[#9b9e9b]',
              model?.online && 'bg-[#438261] shadow-[0_0_0_3px_#dce8e0]',
              model && !model.online && 'bg-red',
            )}
          />{' '}
          {model ? (model.online ? model.model : '模型离线') : '检查模型…'}
        </div>
        <button
          className={ui.iconButton}
          type="button"
          onClick={() =>
            void downloadApi(apiPaths.exportConversation(conversation.id), `${conversation.title}.md`).catch(
              (reason: Error) => onError(reason.message),
            )
          }
          title="导出 Markdown"
          aria-label="导出 Markdown"
        >
          <Download size={17} />
        </button>
        <button
          className={cx(ui.iconButton, 'lg:hidden')}
          type="button"
          disabled={readOnly || Boolean(generationId)}
          onClick={onChapter}
          title="结束本章"
          aria-label="结束本章"
        >
          <BookOpenCheck size={17} />
        </button>
        <button
          className={ui.iconButton}
          type="button"
          onClick={onContext}
          title="检查模型上下文"
          aria-label="检查模型上下文"
        >
          <FileSearch size={17} />
        </button>
        <button
          className={ui.iconButton}
          type="button"
          onClick={onDiagnostics}
          title="查看故事诊断"
          aria-label="查看故事诊断"
        >
          <Radar size={17} />
        </button>
        <button
          className={ui.iconButton}
          type="button"
          onClick={onMods}
          title="管理当前故事 MOD"
          aria-label="管理当前故事 MOD"
        >
          <Puzzle size={17} />
        </button>
      </div>
    </header>
  )
}
