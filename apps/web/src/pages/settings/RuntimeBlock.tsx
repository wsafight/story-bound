import type { PromptAudit, RuntimeStatus } from '@storybound/shared'
import { Activity, Blocks, FileCheck2 } from 'lucide-react'
import { cx } from '../../shared/ui'

export function RuntimeBlock({
  runtime,
  promptAudit,
}: {
  runtime: RuntimeStatus | null
  promptAudit: PromptAudit | null
}) {
  return (
    <section className="mt-[34px] border-t border-line py-[25px]" aria-label="扩展运行时">
      <header className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3.5">
        <span className="grid size-[38px] place-items-center rounded bg-blue-soft text-blue">
          <Blocks size={20} />
        </span>
        <div>
          <h2 className="m-0 text-[15px] font-bold">扩展运行时</h2>
          <p className="mt-1 mb-0 text-[11px] text-muted">
            {runtime ? `${runtime.engine} ${runtime.version}` : '正在读取运行状态'}
          </p>
        </div>
        <em
          className={cx(
            'inline-flex items-center gap-[5px] text-[11px] not-italic text-muted',
            runtime && 'text-green',
          )}
        >
          <Activity size={13} /> {runtime ? '运行中' : '等待中'}
        </em>
      </header>
      {runtime && (
        <>
          <div className="mt-6 mb-5 grid grid-cols-2 border-y border-line sm:ml-14 sm:grid-cols-4 [&>span]:grid [&>span]:min-w-0 [&>span]:gap-[5px] [&>span]:border-r [&>span]:border-line [&>span]:px-3.5 [&>span]:py-4 [&>span:nth-child(2n)]:border-r-0 sm:[&>span:nth-child(2)]:border-r sm:[&>span:last-child]:border-r-0">
            <span>
              <strong className="font-serif text-[22px] leading-none font-bold">{runtime.plugins.length}</strong>
              <small className="text-[10px] text-muted">已加载插件</small>
            </span>
            <span>
              <strong className="font-serif text-[22px] leading-none font-bold">
                {runtime.scheduler.active}/{runtime.scheduler.limit}
              </strong>
              <small className="text-[10px] text-muted">生成并发</small>
            </span>
            <span>
              <strong className="font-serif text-[22px] leading-none font-bold">
                {runtime.metrics.successRate === null ? '—' : `${Math.round(runtime.metrics.successRate * 100)}%`}
              </strong>
              <small className="text-[10px] text-muted">本次成功率</small>
            </span>
            <span>
              <strong className="font-serif text-[22px] leading-none font-bold">{runtime.metrics.tokens.output}</strong>
              <small className="text-[10px] text-muted">输出 Token</small>
            </span>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-14">
            {runtime.plugins.map((plugin) => (
              <span
                className="inline-flex min-h-[34px] items-center gap-[7px] rounded border border-line bg-surface px-2.5 text-[11px]"
                key={plugin.name}
              >
                <i className="size-1.5 rounded-full bg-green shadow-[0_0_0_3px_var(--color-green-soft)]" />{' '}
                {plugin.name}
                <small className="text-muted">
                  {plugin.instances} 实例 · {plugin.states.join(', ')}
                </small>
              </span>
            ))}
          </div>
        </>
      )}
      {promptAudit && (
        <section className="mt-8 border-t border-line pt-6 sm:ml-14">
          <header className="mb-4 flex items-start gap-3">
            <span className="grid size-[34px] shrink-0 place-items-center rounded bg-[#edf1ed] text-green">
              <FileCheck2 size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="m-0 text-[13px] font-bold">Prompt 审计</h3>
              <p className="mt-1 mb-0 font-mono text-[10px] text-muted [overflow-wrap:anywhere]">
                {promptAudit.profile.id} · v{promptAudit.profile.version} · {promptAudit.profile.hash.slice(0, 12)}
              </p>
            </div>
          </header>
          <div className="grid gap-2">
            {promptAudit.checks.map((check) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-line py-2" key={check.id}>
                <span className="min-w-0">
                  <strong className="block truncate text-xs">{check.title}</strong>
                  <small className="text-muted">{check.message}</small>
                </span>
                <em
                  className={cx(
                    'text-[10px] not-italic',
                    check.status === 'passed' && 'text-green',
                    check.status === 'warning' && 'text-[#7a632d]',
                    check.status === 'failed' && 'text-red',
                  )}
                >
                  {check.status}
                </em>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {promptAudit.goldenScenarios.map((scenario) => (
              <span
                className="inline-flex min-h-[30px] items-center gap-1.5 rounded border border-line bg-surface px-2.5 text-[10px]"
                key={scenario.id}
                title={scenario.assertions.join('；')}
              >
                <FileCheck2 size={12} /> {scenario.title}
              </span>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
