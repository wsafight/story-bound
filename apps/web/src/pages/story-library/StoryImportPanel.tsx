import type { StoryImportReport } from '@storybound/shared'
import { AlertCircle, FileJson, Upload, X } from 'lucide-react'
import { type ChangeEvent, type FormEvent } from 'react'
import { buttonClass, cx, noticeClass, ui } from '../../shared/ui'

interface StoryImportPanelProps {
  open: boolean
  jsonText: string
  report: StoryImportReport | null
  importing: boolean
  error: string
  onJsonTextChange: (value: string) => void
  onFile: (file: File) => void
  onInspect: (event: FormEvent) => void
  onImport: () => void
  onClose: () => void
}

function statusText(report: StoryImportReport) {
  if (!report.canImport) return '不能导入'
  return report.dryRun ? '可导入' : '已导入'
}

export function StoryImportPanel({
  open,
  jsonText,
  report,
  importing,
  error,
  onJsonTextChange,
  onFile,
  onInspect,
  onImport,
  onClose,
}: StoryImportPanelProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-80 flex justify-end">
      <button
        className="absolute inset-0 cursor-default border-0 bg-[#141816]/35"
        type="button"
        onClick={onClose}
        aria-label="关闭导入面板"
      />
      <aside
        className="relative flex h-full w-full max-w-[520px] flex-col bg-[#f7f8f6] shadow-[-14px_0_40px_rgba(16,22,18,0.16)]"
        role="dialog"
        aria-modal="true"
        aria-label="导入故事卡"
      >
        <header className="flex min-h-[68px] items-center justify-between gap-3.5 border-b border-line bg-surface pr-[18px] pl-[22px]">
          <div className="grid gap-[3px]">
            <span className="text-[9px] text-muted uppercase">Story Import</span>
            <h2 className="m-0 font-serif text-lg leading-[1.2] font-bold">导入故事卡</h2>
          </div>
          <button className={ui.iconButton} type="button" onClick={onClose} title="关闭" aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <form className="min-h-0 overflow-y-auto px-[22px] pt-[18px] pb-[34px]" onSubmit={onInspect}>
          {error && <div className={noticeClass(true, 'mb-4')}>{error}</div>}
          <label className="mb-3 grid gap-1.5 text-xs font-semibold text-[#505652]">
            JSON 文件
            <span className="flex min-h-11 items-center gap-2 rounded border border-line bg-surface px-3 text-muted">
              <Upload size={15} />
              <input
                className="min-w-0 flex-1 text-xs"
                type="file"
                accept="application/json,.json"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0]
                  if (file) onFile(file)
                }}
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#505652]">
            JSON 内容
            <textarea
              className={cx(ui.field, 'min-h-[240px] font-mono text-xs leading-[1.6]')}
              value={jsonText}
              onChange={(event) => onJsonTextChange(event.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={buttonClass('secondary')} type="submit" disabled={importing || !jsonText.trim()}>
              <FileJson size={15} /> 检查
            </button>
            <button
              className={buttonClass('primary')}
              type="button"
              disabled={importing || !report?.canImport || !jsonText.trim()}
              onClick={onImport}
            >
              <Upload size={15} /> {importing ? '导入中…' : '导入草稿'}
            </button>
          </div>
          {report && (
            <section className="mt-5 border-t border-line pt-4">
              <header className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{report.storyTitle || report.format}</strong>
                  <small className="text-muted">
                    {statusText(report)} · {report.adapter} · v{report.formatVersion ?? 'unknown'}
                  </small>
                </div>
                <em className={cx('shrink-0 text-[10px] not-italic', report.canImport ? 'text-green' : 'text-red')}>
                  {report.canImport ? 'READY' : 'BLOCKED'}
                </em>
              </header>
              <div className="grid grid-cols-2 border-y border-line text-xs sm:grid-cols-4 [&>span]:grid [&>span]:gap-1 [&>span]:border-r [&>span]:border-line [&>span]:px-3 [&>span]:py-3 [&>span:nth-child(2n)]:border-r-0 sm:[&>span:nth-child(2)]:border-r sm:[&>span:last-child]:border-r-0">
                <span>
                  <strong className="font-serif text-xl leading-none">{report.counts.characters}</strong>
                  <small className="text-muted">人物</small>
                </span>
                <span>
                  <strong className="font-serif text-xl leading-none">{report.counts.scenes}</strong>
                  <small className="text-muted">开场</small>
                </span>
                <span>
                  <strong className="font-serif text-xl leading-none">{report.counts.lorebookEntries}</strong>
                  <small className="text-muted">Lorebook</small>
                </span>
                <span>
                  <strong className="font-serif text-xl leading-none">{report.issues.length}</strong>
                  <small className="text-muted">问题</small>
                </span>
              </div>
              {report.conversion.warnings.map((warning) => (
                <div className={noticeClass(false, 'mt-3')} key={warning}>
                  {warning}
                </div>
              ))}
              {report.issues.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {report.issues.map((issue) => (
                    <div
                      className={cx(
                        'grid grid-cols-[18px_minmax(0,1fr)] gap-2 border border-line bg-surface p-2.5 text-xs',
                        issue.severity === 'error' && 'border-[#dfc4bd] bg-red-soft text-[#703d36]',
                      )}
                      key={`${issue.code}:${issue.path}:${issue.message}`}
                    >
                      <AlertCircle size={15} />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <strong>{issue.code}</strong> · {issue.path}
                        <br />
                        {issue.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {report.unknownTopLevelFields.length > 0 && (
                <p className="text-[11px] text-muted [overflow-wrap:anywhere]">
                  未识别字段：{report.unknownTopLevelFields.join('、')}
                </p>
              )}
              {report.mediaFiles.length > 0 && (
                <p className="text-[11px] text-muted [overflow-wrap:anywhere]">
                  媒体引用：{report.mediaFiles.join('、')}
                </p>
              )}
            </section>
          )}
        </form>
      </aside>
    </div>
  )
}
