import type { ModelHealth, ModelProvider } from '@storybound/shared'
import { Link } from '@tanstack/react-router'
import { Brain, Check, Cloud, Cpu, Wifi, WifiOff } from 'lucide-react'
import { SetupSection } from '../../components/forms/SetupSectionHeader'
import { cx, emptyStateClass } from '../../shared/ui'
import type { ConversationDraft } from './types'

interface ProviderSectionProps {
  providers: ModelProvider[]
  draft: ConversationDraft
  health: ModelHealth | null
  checking: boolean
  onChange: (draft: ConversationDraft) => void
}

export function ProviderBlock({ providers, draft, health, checking, onChange }: ProviderSectionProps) {
  return (
    <SetupSection number="05" title="选择故事模型" description="本次选择会固定在存档中，之后的全局设置不会静默改变它。">
      <div className="grid gap-[9px] sm:ml-14">
        {providers.map((provider) => (
          <label
            className={cx(
              'grid min-h-[68px] min-w-0 cursor-pointer grid-cols-[20px_34px_minmax(0,1fr)_auto] items-center gap-[11px] rounded-md border border-line bg-surface px-3.5 py-3',
              draft.providerId === provider.id && 'border-green shadow-[inset_3px_0_var(--color-green)]',
            )}
            key={provider.id}
          >
            <input
              className="pointer-events-none absolute opacity-0"
              type="radio"
              name="provider"
              checked={draft.providerId === provider.id}
              onChange={() => onChange({ ...draft, providerId: provider.id })}
            />
            <span
              className={cx(
                'grid size-[19px] place-items-center rounded-full border border-[#aeb2ae] text-white',
                draft.providerId === provider.id && 'border-green bg-green',
              )}
            >
              {draft.providerId === provider.id && <Check size={14} />}
            </span>
            <span className="grid size-8 place-items-center rounded border border-line bg-green-soft text-green">
              {provider.kind === 'local' ? <Cpu size={18} /> : <Cloud size={18} />}
            </span>
            <span className="grid min-w-0 gap-[3px] [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap">
              <strong>{provider.name}</strong>
              <small className="text-[10px] text-muted">{provider.defaultModel}</small>
              <em className="flex items-center gap-1 text-[10px] not-italic text-muted">
                <Brain size={12} />{' '}
                {provider.thinkingMode === 'off'
                  ? '不使用思考模式'
                  : provider.thinkingMode === 'on'
                    ? '启用思考模式'
                    : '思考模式由模型决定'}
              </em>
            </span>
            {provider.isDefault && (
              <small className="rounded-[3px] bg-green-soft px-1.5 py-[3px] text-[10px] font-bold text-green">
                默认
              </small>
            )}
          </label>
        ))}
      </div>
      {providers.length === 0 && <div className={emptyStateClass(true)}>请先在设置中添加模型 Provider。</div>}
      {draft.providerId && (
        <div
          className={cx(
            'mt-2.5 flex min-h-[38px] items-center gap-2 border border-line bg-white/50 px-3 text-[11px] text-muted sm:ml-14',
            health?.online && 'border-[#b9cbc1] bg-green-soft text-green',
            health && !health.online && 'border-[#dfc4bd] bg-red-soft text-red',
          )}
        >
          {health?.online ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>
            {checking
              ? '正在检查连接…'
              : health?.online
                ? `${health.model} 已就绪`
                : health?.reason || 'Provider 当前不可用'}
          </span>
          {!health?.online && !checking && (
            <Link className="ml-auto font-bold text-inherit" to="/settings">
              检查设置
            </Link>
          )}
        </div>
      )}
    </SetupSection>
  )
}
