import type { Scene } from '@storybound/shared'
import { Plus, Trash2, Users } from 'lucide-react'
import {
  EditorSectionHeader,
  editorFormGridClass,
  editorItemClass,
  editorItemHeaderClass,
} from '../../components/forms/EditorSectionHeader'
import { buttonClass, cx, ui } from '../../shared/ui'
import type { DraftScene, StoryDraft } from './types'

interface ScenesBlockProps {
  draft: StoryDraft
  onChange: (draft: StoryDraft) => void
  onUpdate: (index: number, values: Partial<DraftScene>) => void
}

export function ScenesBlock({ draft, onChange, onUpdate }: ScenesBlockProps) {
  const addButton = (
    <button
      className={buttonClass('secondary')}
      type="button"
      onClick={() =>
        onChange({
          ...draft,
          scenes: [
            ...draft.scenes,
            {
              id: crypto.randomUUID(),
              title: '',
              description: '',
              location: '',
              time: '',
              participantIds: [],
              entryMethod: '',
              openingMessage: '',
              openingSender: 'narrator',
              openingCharacterId: null,
              initialState: { phase: '故事开始', custom: {} },
              isDefault: draft.scenes.length === 0,
            },
          ],
        })
      }
    >
      <Plus size={15} /> 添加开场
    </button>
  )

  return (
    <section>
      <EditorSectionHeader kicker="05 · 开场" title="故事从哪里开始？" action={addButton} />
      <div className="grid gap-[17px]">
        {draft.scenes.map((scene, index) => (
          <article className={editorItemClass} key={scene.id}>
            <header className={editorItemHeaderClass}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{scene.title || '未命名开场'}</strong>
              <label className="flex items-center gap-[5px] text-[10px] text-muted">
                <input
                  className="accent-green"
                  type="radio"
                  name="default-scene"
                  checked={scene.isDefault}
                  onChange={() =>
                    onChange({
                      ...draft,
                      scenes: draft.scenes.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === index })),
                    })
                  }
                />{' '}
                默认
              </label>
              <button
                className={cx(ui.iconButton, 'text-red')}
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    scenes: draft.scenes
                      .filter((_, itemIndex) => itemIndex !== index)
                      .map((item, itemIndex) => ({
                        ...item,
                        isDefault: item.isDefault || (itemIndex === 0 && scene.isDefault),
                      })),
                  })
                }
                disabled={draft.scenes.length <= 1}
                title="删除开场"
                aria-label="删除开场"
              >
                <Trash2 size={16} />
              </button>
            </header>
            <div className={editorFormGridClass}>
              <label>
                <span>标题</span>
                <input value={scene.title} onChange={(event) => onUpdate(index, { title: event.target.value })} />
              </label>
              <label>
                <span>玩家进入方式</span>
                <input
                  value={scene.entryMethod}
                  onChange={(event) => onUpdate(index, { entryMethod: event.target.value })}
                />
              </label>
              <label>
                <span>地点</span>
                <input value={scene.location} onChange={(event) => onUpdate(index, { location: event.target.value })} />
              </label>
              <label>
                <span>时间</span>
                <input value={scene.time} onChange={(event) => onUpdate(index, { time: event.target.value })} />
              </label>
              <label className="sm:col-span-2">
                <span>场景说明</span>
                <textarea
                  rows={3}
                  value={scene.description}
                  onChange={(event) => onUpdate(index, { description: event.target.value })}
                />
              </label>
              <fieldset className="m-0 border border-line p-3 sm:col-span-2">
                <legend className="flex items-center gap-[5px] px-[5px] text-[10px] text-muted">
                  <Users size={14} /> 在场人物
                </legend>
                <div className="flex flex-wrap gap-[7px]">
                  {draft.characters.map((character) => (
                    <label
                      className="!inline-flex min-h-[30px] !flex-row items-center gap-1.5 rounded-[3px] border border-line bg-surface px-[9px] text-[10px]"
                      key={character.id}
                    >
                      <input
                        className="!min-h-0 !w-auto accent-green"
                        type="checkbox"
                        checked={scene.participantIds.includes(character.id)}
                        onChange={(event) =>
                          onUpdate(index, {
                            participantIds: event.target.checked
                              ? [...scene.participantIds, character.id]
                              : scene.participantIds.filter((id) => id !== character.id),
                          })
                        }
                      />
                      <span>{character.name || '未命名人物'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                <span>开场叙述者</span>
                <select
                  value={scene.openingSender}
                  onChange={(event) =>
                    onUpdate(index, {
                      openingSender: event.target.value as Scene['openingSender'],
                      openingCharacterId: event.target.value === 'narrator' ? null : scene.openingCharacterId,
                    })
                  }
                >
                  <option value="narrator">旁白</option>
                  <option value="character">人物</option>
                </select>
              </label>
              <label>
                <span>开场人物</span>
                <select
                  value={scene.openingCharacterId || ''}
                  onChange={(event) => onUpdate(index, { openingCharacterId: event.target.value || null })}
                  disabled={scene.openingSender === 'narrator'}
                >
                  <option value="">选择人物</option>
                  {draft.characters
                    .filter((character) => scene.participantIds.includes(character.id))
                    .map((character) => (
                      <option value={character.id} key={character.id}>
                        {character.name || '未命名人物'}
                      </option>
                    ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span>第一段故事文本</span>
                <textarea
                  rows={8}
                  value={scene.openingMessage}
                  onChange={(event) => onUpdate(index, { openingMessage: event.target.value })}
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
