import type { ContextPreview } from '@storybound/shared'
import { cx } from '../../shared/ui'
import { priorityLabel } from './constants'
import { panelEmptyClass, ToolPanel, toolPanelBodyClass } from './ToolPanel'

interface ContextPanelProps {
  open: boolean
  loading: boolean
  context: ContextPreview | null
  onClose: () => void
}

export function ContextPanel({ open, loading, context, onClose }: ContextPanelProps) {
  return (
    <ToolPanel open={open} eyebrow="下一次生成" title="上下文检查器" ariaLabel="模型上下文检查器" onClose={onClose}>
      <div className={toolPanelBodyClass}>
        {loading && <p className={panelEmptyClass}>正在组装上下文…</p>}
        {!loading && context && !context.available && <p className={panelEmptyClass}>{context.reason}</p>}
        {!loading && context?.available && context.estimate && context.prompt && (
          <>
            <section className="border-b border-line pt-0.5 pb-5">
              <header className="flex items-baseline justify-between gap-2.5">
                <strong className="font-serif text-[22px] leading-none font-bold">
                  {context.estimate.estimatedTokens.toLocaleString()} token
                </strong>
                <span className="text-[10px] text-muted">预算 {context.estimate.requestBudget.toLocaleString()}</span>
              </header>
              <progress
                className="mt-3 h-[7px] w-full accent-green"
                max={context.estimate.requestBudget}
                value={context.estimate.estimatedTokens}
              />
              {context.estimate.calibration && (
                <div className="mt-3 grid gap-1 rounded border border-[#d6dcd7] bg-surface px-3 py-2 text-[10px] text-muted">
                  <span>
                    真实输入 {context.estimate.calibration.actualInputTokens.toLocaleString()} token · 偏差{' '}
                    {context.estimate.calibration.estimateErrorTokens > 0 ? '+' : ''}
                    {context.estimate.calibration.estimateErrorTokens.toLocaleString()}
                  </span>
                  <span>
                    偏差率 {(context.estimate.calibration.estimateErrorRatio * 100).toFixed(1)}% ·{' '}
                    {new Date(context.estimate.calibration.measuredAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              )}
            </section>
            <section className="border-b border-line py-5">
              <h3 className="mt-0 mb-[13px] text-[10px] text-muted uppercase">组成</h3>
              {context.estimate.segments.map((segment) => {
                const meta = [segment.source, segment.scope, priorityLabel(segment.priority)].filter(Boolean)
                const omitted = segment.omittedItems || 0
                return (
                  <div
                    className={cx(
                      'grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[9px] border-t border-dashed border-[#d8ddd8] py-2 text-[11px] first:border-t-0',
                      segment.included === false && 'opacity-60',
                    )}
                    key={`${segment.name}-${segment.source || ''}-${segment.scope || ''}`}
                  >
                    <span className="grid min-w-0 gap-[3px]">
                      {segment.name}
                      {meta.length > 0 && (
                        <small className="text-[9px] leading-[1.35] text-muted">{meta.join(' · ')}</small>
                      )}
                      {(omitted > 0 || segment.reason) && (
                        <em className="w-fit rounded-[3px] bg-[#eee4d4] px-[5px] py-0.5 text-[9px] not-italic text-[#765d35]">
                          {omitted > 0 ? `省略 ${omitted} 项` : '预算省略'}
                          {segment.reason === 'budget_exceeded' ? ' · 预算不足' : ''}
                        </em>
                      )}
                    </span>
                    <strong className="font-mono text-[10px] leading-none font-medium text-muted">
                      {segment.included === false ? '省略' : segment.estimatedTokens}
                    </strong>
                    {segment.budget !== undefined && (
                      <small className="min-w-[50px] text-right font-mono text-[9px] leading-none font-medium text-[#8a918c]">
                        {segment.budget.toLocaleString()}
                      </small>
                    )}
                  </div>
                )
              })}
            </section>
            <section className="border-b border-line py-5">
              <h3 className="mt-0 mb-[13px] text-[10px] text-muted uppercase">MOD 贡献</h3>
              {context.prompt.contributions.length === 0 ? (
                <p className="text-[11px] text-muted">当前没有 MOD 提示词。</p>
              ) : (
                context.prompt.contributions.map((item) => (
                  <div
                    className={cx(
                      'grid grid-cols-[1fr_auto] gap-x-3 gap-y-[5px] border-t border-dashed border-[#d5d9d5] py-3',
                      !item.included && 'opacity-55',
                    )}
                    key={`${item.modId}-${item.id}`}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <strong className="text-[9px] text-green">
                      {item.included ? `${item.estimatedTokens} token` : '预算省略'}
                    </strong>
                    <p className="col-span-2 mt-[3px] mb-0 text-[10px] leading-[1.6] whitespace-pre-wrap text-[#626a65]">
                      {item.content}
                    </p>
                  </div>
                ))
              )}
            </section>
            <details className="mt-5">
              <summary className="cursor-pointer text-[11px] font-bold text-green">系统提示词</summary>
              <pre className="mt-3 max-h-[420px] overflow-auto border border-line bg-paper p-[13px] font-mono text-[10px] leading-[1.65] whitespace-pre-wrap [overflow-wrap:anywhere]">
                {context.prompt.system}
              </pre>
            </details>
          </>
        )}
      </div>
    </ToolPanel>
  )
}
