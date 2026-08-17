import type { Conversation, ConversationMod, ModConfigField } from '@storybound/shared'
import { Check } from 'lucide-react'
import { Toggle } from '../../components/forms/Toggle'
import { buttonClass, cx } from '../../shared/ui'
import { panelEmptyClass, ToolPanel, toolPanelBodyClass } from './ToolPanel'

interface ModPanelProps {
  open: boolean
  loading: boolean
  conversation: Conversation
  mods: ConversationMod[]
  drafts: Record<string, Record<string, unknown>>
  generationId: string | null
  updatingMod: string | null
  onClose: () => void
  onApply: (mod: ConversationMod, enabled?: boolean) => void
  onDraftChange: (mod: ConversationMod, field: ModConfigField, value: string | boolean | number) => void
}

function isFieldVisible(field: ModConfigField, config: Record<string, unknown>) {
  return !field.visibleWhen || field.visibleWhen.values.includes(String(config[field.visibleWhen.key] ?? ''))
}

export function ModPanel({
  open,
  loading,
  conversation,
  mods,
  drafts,
  generationId,
  updatingMod,
  onClose,
  onApply,
  onDraftChange,
}: ModPanelProps) {
  return (
    <ToolPanel open={open} eyebrow="当前存档" title="故事 MOD" ariaLabel="当前故事 MOD" onClose={onClose}>
      <div className={toolPanelBodyClass}>
        {loading && <p className={panelEmptyClass}>正在读取…</p>}
        {!loading &&
          mods.map((mod) => {
            const draftConfig = drafts[mod.id] || mod.config
            const configChanged = JSON.stringify(draftConfig) !== JSON.stringify(mod.config)
            return (
              <section className="border-b border-line py-[17px] pb-5 first:pt-0.5" key={mod.id}>
                <header className="flex items-center justify-between gap-4">
                  <div className="grid gap-1">
                    <strong className={cx('text-sm', mod.active && 'text-green')}>{mod.name}</strong>
                    <small className="text-[10px] text-muted">
                      v{mod.version} · {mod.activationPolicy === 'immediate' ? '即时生效' : '下一章节生效'}
                    </small>
                  </div>
                  <Toggle
                    checked={mod.active}
                    disabled={!mod.enabled || Boolean(generationId) || updatingMod === mod.id}
                    onChange={(event) => onApply(mod, event.target.checked)}
                  />
                </header>
                <p className="mt-2.5 mr-[54px] mb-3.5 text-[11px] leading-[1.65] text-[#626a65]">{mod.description}</p>
                <div className="mt-3 grid gap-2.5">
                  {mod.configFields
                    .filter((field) => isFieldVisible(field, draftConfig))
                    .map((field) => {
                      if (field.type === 'boolean')
                        return (
                          <label className="flex items-center gap-2 text-[11px] text-muted" key={field.key}>
                            <input
                              className="size-4 accent-green"
                              type="checkbox"
                              checked={Boolean(draftConfig[field.key])}
                              disabled={!mod.enabled || Boolean(generationId)}
                              onChange={(event) => onDraftChange(mod, field, event.target.checked)}
                            />
                            <span>{field.label}</span>
                          </label>
                        )
                      if (field.type === 'number')
                        return (
                          <label className="grid gap-[5px]" key={field.key}>
                            <span className="text-[10px] font-bold text-muted">{field.label}</span>
                            <input
                              className="min-h-9 w-full rounded border border-line bg-surface px-2.5 text-[11px] outline-none focus:border-green"
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step || 1}
                              value={Number(draftConfig[field.key] ?? field.min ?? 0)}
                              disabled={!mod.enabled || Boolean(generationId)}
                              onChange={(event) => {
                                const value = event.target.valueAsNumber
                                onDraftChange(mod, field, Number.isFinite(value) ? value : field.min || 0)
                              }}
                            />
                          </label>
                        )
                      const options =
                        field.type === 'character-select'
                          ? conversation.story.characters.map((character) => ({
                              value: character.id,
                              label: character.name,
                            }))
                          : field.options || []
                      return (
                        <label className="grid gap-[5px]" key={field.key}>
                          <span className="text-[10px] font-bold text-muted">{field.label}</span>
                          <select
                            className="min-h-9 w-full rounded border border-line bg-surface px-2.5 text-[11px] outline-none focus:border-green"
                            value={String(draftConfig[field.key] ?? '')}
                            disabled={!mod.enabled || Boolean(generationId) || options.length === 0}
                            onChange={(event) => onDraftChange(mod, field, event.target.value)}
                          >
                            {options.map((option) => (
                              <option
                                value={option.value}
                                key={option.value}
                                disabled={
                                  field.key === 'perspective' &&
                                  (option.value === 'first_character' || option.value === 'third_character') &&
                                  conversation.story.characters.length === 0
                                }
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    })}
                </div>
                <footer className="mt-3.5 flex min-h-[30px] items-center justify-between gap-3">
                  <small className="text-[10px] text-muted">
                    {!mod.enabled ? '运行时未加载' : mod.active ? '已写入当前检查点' : '未启用'}
                  </small>
                  {mod.active && configChanged && (
                    <button
                      className={buttonClass('secondary')}
                      type="button"
                      disabled={updatingMod === mod.id || Boolean(generationId)}
                      onClick={() => onApply(mod)}
                    >
                      <Check size={14} /> 应用配置
                    </button>
                  )}
                </footer>
              </section>
            )
          })}
      </div>
    </ToolPanel>
  )
}
