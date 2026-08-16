import { Plus, Trash2 } from 'lucide-react'
import {
  EditorSectionHeader,
  editorFormGridClass,
  editorItemClass,
  editorItemHeaderClass,
} from '../../components/forms/EditorSectionHeader'
import { buttonClass, cx, emptyStateClass, ui } from '../../shared/ui'
import { JsonField } from './JsonField'
import type { DraftAbility, StoryDraft } from './types'

interface AbilitiesBlockProps {
  draft: StoryDraft
  onChange: (draft: StoryDraft) => void
  onUpdate: (index: number, values: Partial<DraftAbility>) => void
}

const emptyObjectSchema = { type: 'object', properties: {}, additionalProperties: false }

export function AbilitiesBlock({ draft, onChange, onUpdate }: AbilitiesBlockProps) {
  const addButton = (
    <button
      className={buttonClass('secondary')}
      type="button"
      onClick={() =>
        onChange({
          ...draft,
          abilities: [
            ...draft.abilities,
            {
              id: crypto.randomUUID(),
              name: '',
              category: 'player',
              description: '',
              prompt: '',
              enabledByDefault: true,
              configSchema: emptyObjectSchema,
              inputSchema: emptyObjectSchema,
              resultSchema: emptyObjectSchema,
              runtime: { usesPerConversation: null, cooldownTurns: 0, statePatch: {} },
            },
          ],
        })
      }
    >
      <Plus size={15} /> 添加能力
    </button>
  )

  return (
    <section>
      <EditorSectionHeader kicker="04 · 能力" title="玩家可以借助什么推进故事？" action={addButton} />
      {draft.abilities.length === 0 && <div className={emptyStateClass(true)}>这个故事暂时没有额外能力。</div>}
      <div className="grid gap-[17px]">
        {draft.abilities.map((ability, index) => (
          <article className={editorItemClass} key={ability.id}>
            <header className={editorItemHeaderClass}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{ability.name || '未命名能力'}</strong>
              <button
                className={cx(ui.iconButton, 'text-red')}
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    abilities: draft.abilities.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                title="删除能力"
                aria-label="删除能力"
              >
                <Trash2 size={16} />
              </button>
            </header>
            <div className={editorFormGridClass}>
              <label>
                <span>名称</span>
                <input value={ability.name} onChange={(event) => onUpdate(index, { name: event.target.value })} />
              </label>
              <label>
                <span>类别</span>
                <select
                  value={ability.category}
                  onChange={(event) => onUpdate(index, { category: event.target.value as DraftAbility['category'] })}
                >
                  <option value="player">玩家能力</option>
                  <option value="character">人物能力</option>
                  <option value="mechanic">故事机制</option>
                </select>
              </label>
              <label className="sm:col-span-2">
                <span>玩家可见说明</span>
                <textarea
                  rows={3}
                  value={ability.description}
                  onChange={(event) => onUpdate(index, { description: event.target.value })}
                />
              </label>
              <label className="sm:col-span-2">
                <span>注入模型的提示</span>
                <textarea
                  rows={4}
                  value={ability.prompt}
                  onChange={(event) => onUpdate(index, { prompt: event.target.value })}
                />
              </label>
              <label className="!flex !flex-row !items-center !gap-2 sm:col-span-2">
                <input
                  className="!min-h-[17px] !w-[17px] accent-green"
                  type="checkbox"
                  checked={ability.enabledByDefault}
                  onChange={(event) => onUpdate(index, { enabledByDefault: event.target.checked })}
                />
                <span>新建存档时默认启用</span>
              </label>
              <label>
                <span>总使用次数</span>
                <input
                  type="number"
                  min={0}
                  value={ability.runtime.usesPerConversation ?? ''}
                  placeholder="不限"
                  onChange={(event) =>
                    onUpdate(index, {
                      runtime: {
                        ...ability.runtime,
                        usesPerConversation: event.target.value ? Number(event.target.value) : null,
                      },
                    })
                  }
                />
              </label>
              <label>
                <span>冷却轮数</span>
                <input
                  type="number"
                  min={0}
                  value={ability.runtime.cooldownTurns}
                  onChange={(event) =>
                    onUpdate(index, {
                      runtime: { ...ability.runtime, cooldownTurns: Number(event.target.value || 0) },
                    })
                  }
                />
              </label>
              <JsonField
                label="配置 Schema"
                value={ability.configSchema}
                rows={5}
                onValidChange={(configSchema) => onUpdate(index, { configSchema })}
              />
              <JsonField
                label="输入 Schema"
                value={ability.inputSchema}
                rows={5}
                onValidChange={(inputSchema) => onUpdate(index, { inputSchema })}
              />
              <JsonField
                label="结果 Schema"
                value={ability.resultSchema}
                rows={5}
                onValidChange={(resultSchema) => onUpdate(index, { resultSchema })}
              />
              <JsonField
                label="状态提交 Patch"
                value={ability.runtime.statePatch}
                rows={4}
                onValidChange={(statePatch) => onUpdate(index, { runtime: { ...ability.runtime, statePatch } })}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
