import type { Character } from '@storybound/shared'
import { Plus, Trash2 } from 'lucide-react'
import {
  EditorSectionHeader,
  editorFormGridClass,
  editorItemClass,
  editorItemHeaderClass,
} from '../../components/forms/EditorSectionHeader'
import { createUuid } from '../../shared/id'
import { buttonClass, cx, ui } from '../../shared/ui'
import type { DraftCharacter, StoryDraft } from './types'

interface CharactersBlockProps {
  draft: StoryDraft
  onChange: (draft: StoryDraft) => void
  onUpdate: (index: number, values: Partial<DraftCharacter>) => void
  onRemove: (index: number) => void
}

export function CharactersBlock({ draft, onChange, onUpdate, onRemove }: CharactersBlockProps) {
  const addButton = (
    <button
      className={buttonClass('secondary')}
      type="button"
      onClick={() =>
        onChange({
          ...draft,
          characters: [
            ...draft.characters,
            {
              id: createUuid(),
              name: '',
              roleType: 'supporting',
              identity: '',
              appearance: '',
              personality: '',
              speechStyle: '',
              goals: '',
              knowledgeScope: '',
            },
          ],
        })
      }
    >
      <Plus size={15} /> 添加人物
    </button>
  )

  return (
    <section>
      <EditorSectionHeader kicker="02 · 人物" title="谁在故事里等待玩家？" action={addButton} />
      <div className="grid gap-[17px]">
        {draft.characters.map((character, index) => (
          <article className={editorItemClass} data-story-path={`characters.${index}`} key={character.id}>
            <header className={editorItemHeaderClass}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{character.name || '未命名人物'}</strong>
              <button
                className={cx(ui.iconButton, 'text-red')}
                type="button"
                onClick={() => onRemove(index)}
                disabled={draft.characters.length <= 1}
                title="删除人物"
                aria-label="删除人物"
              >
                <Trash2 size={16} />
              </button>
            </header>
            <div className={editorFormGridClass}>
              <label data-story-path={`characters.${index}.name`}>
                <span>名字</span>
                <input value={character.name} onChange={(event) => onUpdate(index, { name: event.target.value })} />
              </label>
              <label data-story-path={`characters.${index}.roleType`}>
                <span>角色类型</span>
                <select
                  value={character.roleType}
                  onChange={(event) => onUpdate(index, { roleType: event.target.value as Character['roleType'] })}
                >
                  <option value="main">主要人物</option>
                  <option value="supporting">关联人物</option>
                  <option value="background">背景人物</option>
                </select>
              </label>
              <label className="sm:col-span-2" data-story-path={`characters.${index}.identity`}>
                <span>身份</span>
                <textarea
                  rows={2}
                  value={character.identity}
                  onChange={(event) => onUpdate(index, { identity: event.target.value })}
                />
              </label>
              <label data-story-path={`characters.${index}.appearance`}>
                <span>外貌</span>
                <textarea
                  rows={3}
                  value={character.appearance}
                  onChange={(event) => onUpdate(index, { appearance: event.target.value })}
                />
              </label>
              <label data-story-path={`characters.${index}.personality`}>
                <span>性格</span>
                <textarea
                  rows={3}
                  value={character.personality}
                  onChange={(event) => onUpdate(index, { personality: event.target.value })}
                />
              </label>
              <label data-story-path={`characters.${index}.speechStyle`}>
                <span>说话方式</span>
                <textarea
                  rows={3}
                  value={character.speechStyle}
                  onChange={(event) => onUpdate(index, { speechStyle: event.target.value })}
                />
              </label>
              <label data-story-path={`characters.${index}.goals`}>
                <span>目标与动机</span>
                <textarea
                  rows={3}
                  value={character.goals}
                  onChange={(event) => onUpdate(index, { goals: event.target.value })}
                />
              </label>
              <label className="sm:col-span-2" data-story-path={`characters.${index}.knowledgeScope`}>
                <span>知情范围</span>
                <textarea
                  rows={3}
                  value={character.knowledgeScope}
                  onChange={(event) => onUpdate(index, { knowledgeScope: event.target.value })}
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
