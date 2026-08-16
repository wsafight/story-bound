import type { FormEvent } from 'react'
import { buttonClass, ui } from '../../shared/ui'
import { ToolPanel } from './ToolPanel'

interface ChapterPanelProps {
  open: boolean
  title: string
  summary: string
  saving: boolean
  onTitleChange: (title: string) => void
  onSummaryChange: (summary: string) => void
  onSubmit: (event: FormEvent) => void
  onClose: () => void
}

export function ChapterPanel({
  open,
  title,
  summary,
  saving,
  onTitleChange,
  onSummaryChange,
  onSubmit,
  onClose,
}: ChapterPanelProps) {
  return (
    <ToolPanel open={open} eyebrow="保存回顾" title="结束当前章节" ariaLabel="结束当前章节" onClose={onClose}>
      <form className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-[22px]" onSubmit={onSubmit}>
        <label className="grid gap-[7px]">
          <span className="text-[11px] font-bold text-muted">章节标题</span>
          <input
            className={ui.field}
            value={title}
            maxLength={120}
            onChange={(event) => onTitleChange(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-[7px]">
          <span className="text-[11px] font-bold text-muted">章节摘要</span>
          <textarea
            className={ui.field}
            rows={14}
            value={summary}
            maxLength={4_000}
            onChange={(event) => onSummaryChange(event.target.value)}
            required
          />
        </label>
        <footer className="mt-auto flex justify-end gap-2">
          <button className={buttonClass('secondary')} type="button" onClick={onClose}>
            取消
          </button>
          <button className={buttonClass('primary')} type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存并开始下一章'}
          </button>
        </footer>
      </form>
    </ToolPanel>
  )
}
