import type { ModConfigField, RuntimeMod } from '@storybound/shared'
import { Puzzle } from 'lucide-react'
import { Toggle } from '../../components/forms/Toggle'
import { cx } from '../../shared/ui'

interface ModManagementProps {
  mods: RuntimeMod[]
  updatingMod: string | null
  onUpdate: (mod: RuntimeMod, body: { enabled?: boolean; defaultConfig?: Record<string, unknown> }) => void
}

function isFieldVisible(field: ModConfigField, config: Record<string, unknown>) {
  return !field.visibleWhen || field.visibleWhen.values.includes(String(config[field.visibleWhen.key] ?? ''))
}

export function ModManagementBlock({ mods, updatingMod, onUpdate }: ModManagementProps) {
  return (
    <section className="mt-[34px] border-t border-line pt-[25px] pb-1" aria-label="可信 MOD">
      <header className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3.5">
        <span className="grid size-[38px] place-items-center rounded bg-[#eee4d4] text-[#6f5530]">
          <Puzzle size={20} />
        </span>
        <div>
          <h2 className="m-0 text-[15px] font-bold">可信 MOD</h2>
          <p className="mt-1 mb-0 text-[11px] text-muted">已随 Storybound 安装的受控扩展</p>
        </div>
        <em className="text-[10px] not-italic text-muted">
          {mods.filter((mod) => mod.enabled).length} / {mods.length} 已加载
        </em>
      </header>
      <div className="mt-5 grid gap-2.5 sm:ml-14 md:grid-cols-2 xl:grid-cols-3">
        {mods.map((mod) => (
          <article
            className={cx(
              'flex min-w-0 flex-col rounded-md border border-line bg-surface p-3.5',
              !mod.enabled && 'opacity-60',
            )}
            key={mod.id}
          >
            <header className="flex items-center justify-between gap-2.5">
              <div className="grid min-w-0 gap-1">
                <strong className="truncate text-xs">{mod.name}</strong>
                <small className="truncate text-[9px] text-muted">
                  v{mod.version} · {mod.activationPolicy === 'immediate' ? '即时生效' : '下一章节生效'}
                </small>
              </div>
              <Toggle
                title={mod.activeConversations > 0 ? `${mod.activeConversations} 个存档正在使用` : '切换加载状态'}
                checked={mod.enabled}
                disabled={updatingMod === mod.id}
                onChange={(event) => onUpdate(mod, { enabled: event.target.checked })}
              />
            </header>
            <p className="my-3 min-h-[52px] text-[10px] leading-[1.65] text-[#626a65]">{mod.description}</p>
            <div className="mb-3.5 grid gap-[9px]">
              {mod.configFields
                .filter((field) => field.type !== 'character-select' && isFieldVisible(field, mod.defaultConfig))
                .map((field) =>
                  field.type === 'number' ? (
                    <label className="grid gap-[5px]" key={field.key}>
                      <span className="text-[9px] text-muted">{field.label}</span>
                      <input
                        className="h-8 w-full rounded-[3px] border border-line bg-[#f8f9f7] px-2 text-[10px]"
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step || 1}
                        value={Number(mod.defaultConfig[field.key] ?? field.min ?? 0)}
                        disabled={!mod.enabled || updatingMod === mod.id}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber
                          onUpdate(mod, {
                            defaultConfig: {
                              ...mod.defaultConfig,
                              [field.key]: Number.isFinite(value) ? value : field.min || 0,
                            },
                          })
                        }}
                      />
                    </label>
                  ) : field.type === 'select' ? (
                    <label className="grid gap-[5px]" key={field.key}>
                      <span className="text-[9px] text-muted">{field.label}</span>
                      <select
                        className="h-8 w-full rounded-[3px] border border-line bg-[#f8f9f7] px-2 text-[10px]"
                        value={String(mod.defaultConfig[field.key] ?? '')}
                        disabled={!mod.enabled || updatingMod === mod.id}
                        onChange={(event) =>
                          onUpdate(mod, {
                            defaultConfig: { ...mod.defaultConfig, [field.key]: event.target.value },
                          })
                        }
                      >
                        {field.options
                          ?.filter(
                            (option) =>
                              field.key !== 'perspective' ||
                              (option.value !== 'first_character' && option.value !== 'third_character'),
                          )
                          .map((option) => (
                            <option value={option.value} key={option.value}>
                              {option.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex min-h-[26px] items-center gap-[7px]" key={field.key}>
                      <input
                        className="size-[15px] accent-green"
                        type="checkbox"
                        checked={Boolean(mod.defaultConfig[field.key])}
                        disabled={!mod.enabled || updatingMod === mod.id}
                        onChange={(event) =>
                          onUpdate(mod, {
                            defaultConfig: { ...mod.defaultConfig, [field.key]: event.target.checked },
                          })
                        }
                      />
                      <span className="text-[9px] text-[#515a54]">{field.label}</span>
                    </label>
                  ),
                )}
            </div>
            <footer className="mt-auto flex justify-between gap-2 border-t border-line pt-3">
              <span className={cx('text-[9px] text-muted', mod.runtime.loaded && 'text-green')}>
                {mod.runtime.loaded ? mod.runtime.state : '未加载'}
              </span>
              <small className="truncate text-[9px] text-muted">{mod.activeConversations} 个存档启用</small>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
