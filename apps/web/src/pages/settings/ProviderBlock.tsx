import type { ModelHealth, ModelProvider } from '@storybound/shared'
import { Brain, Check, Cloud, Cpu, KeyRound, RefreshCw, Save, Trash2, Wifi, WifiOff } from 'lucide-react'
import type { FormEvent } from 'react'
import { buttonClass, cx, ui } from '../../shared/ui'
import type { ProviderDraft } from './types'

const providerFieldClass =
  'min-h-10 w-full rounded border border-line bg-surface px-[11px] outline-none focus:border-green focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)]'
const providerLabelClass = 'flex items-center gap-[5px] text-[11px] font-semibold text-[#505652]'
const segmentedClass = 'grid min-h-10 grid-flow-col auto-cols-fr rounded-[5px] border border-line bg-[#edf1ee] p-[3px]'
const segmentedButtonClass =
  'inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[3px] border-0 bg-transparent px-[9px] text-[11px] text-muted'

interface ProviderPanelProps {
  providers: ModelProvider[]
  draft: ProviderDraft
  health: ModelHealth | null
  loading: boolean
  saving: boolean
  checking: boolean
  onDraftChange: (draft: ProviderDraft) => void
  onSelect: (provider: ModelProvider) => void
  onSubmit: (event: FormEvent) => void
  onCheck: () => void
  onMakeDefault: () => void
  onRemove: () => void
}

export function ProviderBlock({
  providers,
  draft,
  health,
  loading,
  saving,
  checking,
  onDraftChange,
  onSelect,
  onSubmit,
  onCheck,
  onMakeDefault,
  onRemove,
}: ProviderPanelProps) {
  const selected = providers.find((provider) => provider.id === draft.id)

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-[7px] border border-line bg-white/45 md:grid-cols-[230px_minmax(0,1fr)]">
      <aside
        className="flex gap-2 overflow-x-auto border-b border-line bg-[#f3f6f3] p-3 md:block md:border-r md:border-b-0"
        aria-label="模型 Provider"
      >
        {loading && <p className="p-2.5 text-xs text-muted">正在读取配置…</p>}
        {providers.map((provider) => (
          <button
            className={cx(
              'grid min-h-[60px] min-w-[190px] cursor-pointer grid-cols-[32px_minmax(0,1fr)_18px] items-center gap-2 rounded border-0 bg-transparent px-[9px] py-2 text-left hover:bg-[#e9efeb] md:w-full md:min-w-0',
              provider.id === draft.id && 'bg-green-soft text-green',
            )}
            type="button"
            onClick={() => onSelect(provider)}
            key={provider.id}
          >
            <span className="grid size-[30px] place-items-center rounded border border-[#d1d2cb] bg-surface">
              {provider.kind === 'local' ? <Cpu size={17} /> : <Cloud size={17} />}
            </span>
            <span className="grid min-w-0 gap-1">
              <strong className="truncate text-xs">{provider.name}</strong>
              <small className="truncate text-[10px] text-muted">{provider.defaultModel}</small>
            </span>
            {provider.isDefault && (
              <em className="grid place-items-center not-italic" title="默认 Provider">
                <Check size={13} />
              </em>
            )}
          </button>
        ))}
      </aside>

      <form className="min-w-0 bg-surface px-4 py-[25px] pb-[26px] sm:px-7" onSubmit={onSubmit}>
        <header className="flex min-h-[52px] items-start justify-between gap-5 border-b border-line">
          <div>
            <h2 className="m-0 text-[15px] font-bold">{draft.id ? 'Provider 配置' : '添加 Provider'}</h2>
            <p className="mt-1 mb-0 text-[11px] text-muted">
              {selected?.isDefault ? '当前默认配置' : '用于后续新建存档'}
            </p>
          </div>
          {draft.id && (
            <span
              className={cx(
                'inline-flex items-center gap-1.5 text-xs text-muted',
                health?.online && 'text-green',
                health && !health.online && 'text-red',
              )}
            >
              {health?.online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {health ? (health.online ? '连接正常' : '连接失败') : '尚未检查'}
            </span>
          )}
        </header>

        <div className="grid grid-cols-1 gap-[15px] py-[23px] sm:grid-cols-2">
          <label className="grid min-w-0 gap-[7px]">
            <span className={providerLabelClass}>名称</span>
            <input
              className={providerFieldClass}
              value={draft.name}
              maxLength={60}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              required
            />
          </label>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={cx(providerLabelClass, 'mb-[7px]')}>位置</legend>
            <div className={segmentedClass}>
              <button
                type="button"
                className={cx(
                  segmentedButtonClass,
                  draft.kind === 'local' && 'bg-surface font-bold text-green shadow-[0_1px_4px_rgba(31,35,32,0.1)]',
                )}
                onClick={() => onDraftChange({ ...draft, kind: 'local' })}
              >
                <Cpu size={15} /> 本地
              </button>
              <button
                type="button"
                className={cx(
                  segmentedButtonClass,
                  draft.kind === 'remote' && 'bg-surface font-bold text-green shadow-[0_1px_4px_rgba(31,35,32,0.1)]',
                )}
                onClick={() => onDraftChange({ ...draft, kind: 'remote' })}
              >
                <Cloud size={15} /> 远程
              </button>
            </div>
          </fieldset>
          <label className="grid min-w-0 gap-[7px] sm:col-span-2">
            <span className={providerLabelClass}>API 基础地址</span>
            <input
              className={providerFieldClass}
              type="url"
              value={draft.baseUrl}
              onChange={(event) => onDraftChange({ ...draft, baseUrl: event.target.value })}
              placeholder={draft.kind === 'local' ? 'http://127.0.0.1:8000/v1' : 'https://api.example.com/v1'}
              required
            />
          </label>
          <label className="grid min-w-0 gap-[7px] sm:col-span-2">
            <span className={providerLabelClass}>
              <KeyRound size={13} /> API Key
            </span>
            <input
              className={providerFieldClass}
              type="password"
              autoComplete="new-password"
              value={draft.apiKey}
              onChange={(event) => onDraftChange({ ...draft, apiKey: event.target.value })}
              placeholder={draft.id && selected?.hasCredential ? '已保存，留空不会修改' : '没有密钥时可以留空'}
            />
          </label>
          <label className="grid min-w-0 gap-[7px] sm:col-span-2">
            <span className={providerLabelClass}>模型</span>
            <input
              className={providerFieldClass}
              list="provider-models"
              value={draft.defaultModel}
              onChange={(event) => onDraftChange({ ...draft, defaultModel: event.target.value })}
              placeholder="模型 ID"
              required
            />
            <datalist id="provider-models">
              {health?.models.map((model) => (
                <option value={model} key={model} />
              ))}
            </datalist>
          </label>
          <label className="grid min-w-0 gap-[7px]">
            <span className={providerLabelClass}>上下文窗口</span>
            <input
              className={providerFieldClass}
              type="number"
              min={1024}
              max={4000000}
              value={draft.contextWindow}
              onChange={(event) => onDraftChange({ ...draft, contextWindow: Number(event.target.value) })}
            />
          </label>
          <label className="grid min-w-0 gap-[7px]">
            <span className={providerLabelClass}>最大输出 token</span>
            <input
              className={providerFieldClass}
              type="number"
              min={64}
              max={262144}
              value={draft.maxOutputTokens}
              onChange={(event) => onDraftChange({ ...draft, maxOutputTokens: Number(event.target.value) })}
            />
          </label>
        </div>

        <section className="grid items-end gap-[15px] border-y border-line py-[18px] lg:grid-cols-[minmax(150px,1fr)_200px_130px]">
          <div className="flex min-w-0 items-center gap-[9px] text-green">
            <Brain size={18} />
            <span className="grid min-w-0 gap-[3px]">
              <strong className="text-xs text-ink">模型思考</strong>
              <small className="text-[10px] text-muted">思考内容不会写入故事正文</small>
            </span>
          </div>
          <div className={cx(segmentedClass, 'h-10')}>
            {(['off', 'auto', 'on'] as const).map((mode) => (
              <button
                type="button"
                className={cx(
                  segmentedButtonClass,
                  draft.thinkingMode === mode &&
                    'bg-surface font-bold text-green shadow-[0_1px_4px_rgba(31,35,32,0.1)]',
                )}
                onClick={() => onDraftChange({ ...draft, thinkingMode: mode })}
                key={mode}
              >
                {mode === 'off' ? '关闭' : mode === 'auto' ? '自动' : '启用'}
              </button>
            ))}
          </div>
          <label className="grid min-w-0 gap-[7px]">
            <span className={providerLabelClass}>强度</span>
            <select
              className={cx(providerFieldClass, 'disabled:opacity-55')}
              value={draft.thinkingEffort || ''}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  thinkingEffort: (event.target.value || null) as ProviderDraft['thinkingEffort'],
                })
              }
              disabled={draft.thinkingMode === 'off'}
            >
              <option value="">由模型决定</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-[15px] pt-5">
          <div className="flex items-center gap-2">
            {draft.id && (
              <button className={buttonClass('secondary')} type="button" onClick={onCheck} disabled={checking}>
                <RefreshCw size={15} /> {checking ? '检查中…' : '测试连接'}
              </button>
            )}
            {draft.id && !selected?.isDefault && (
              <button className={buttonClass('secondary')} type="button" onClick={onMakeDefault}>
                <Check size={15} /> 设为默认
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {draft.id && !selected?.isDefault && (
              <button
                className={cx(ui.iconButton, 'text-red')}
                type="button"
                onClick={onRemove}
                title="删除 Provider"
                aria-label="删除 Provider"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button className={buttonClass('primary')} type="submit" disabled={saving}>
              <Save size={16} /> {saving ? '保存中…' : '保存配置'}
            </button>
          </div>
        </footer>
        {health?.reason && (
          <div className="mt-4 bg-red-soft px-3 py-2.5 text-[11px] text-[#6d3c34]">{health.reason}</div>
        )}
      </form>
    </div>
  )
}
