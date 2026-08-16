import { EditorSectionHeader, editorSingleFieldsClass } from '../../components/forms/EditorSectionHeader'
import type { StoryDraft } from './types'

interface PlayerBlockProps {
  draft: StoryDraft
  onChange: (draft: StoryDraft) => void
}

export function PlayerBlock({ draft, onChange }: PlayerBlockProps) {
  const updateTemplate = (values: Partial<StoryDraft['playerTemplate']>) =>
    onChange({ ...draft, playerTemplate: { ...draft.playerTemplate, ...values } })

  return (
    <section className="max-w-[780px]">
      <EditorSectionHeader kicker="03 · 玩家身份" title="玩家以什么身份入戏？" />
      <div className={editorSingleFieldsClass}>
        <label>
          <span>身份名称</span>
          <input
            value={draft.playerTemplate.roleName}
            onChange={(event) => updateTemplate({ roleName: event.target.value })}
          />
        </label>
        <label>
          <span>背景与关系</span>
          <textarea
            rows={7}
            value={draft.playerTemplate.background}
            onChange={(event) => updateTemplate({ background: event.target.value })}
          />
        </label>
        <label>
          <span>初始目标</span>
          <textarea
            rows={5}
            value={draft.playerTemplate.goals}
            onChange={(event) => updateTemplate({ goals: event.target.value })}
          />
        </label>
        <label>
          <span>默认称呼</span>
          <input
            value={draft.playerTemplate.defaultValues.name || ''}
            onChange={(event) =>
              updateTemplate({
                defaultValues: { ...draft.playerTemplate.defaultValues, name: event.target.value },
              })
            }
          />
        </label>
      </div>
    </section>
  )
}
