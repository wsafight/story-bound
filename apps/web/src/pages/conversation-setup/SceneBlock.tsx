import type { StoryDetail } from '@storybound/shared'
import { Check, MapPin } from 'lucide-react'
import { SetupSection } from '../../components/forms/SetupSectionHeader'
import { cx } from '../../shared/ui'
import type { ConversationDraft } from './types'

interface SceneSectionProps {
  story: StoryDetail
  draft: ConversationDraft
  onChange: (draft: ConversationDraft) => void
}

export function SceneBlock({ story, draft, onChange }: SceneSectionProps) {
  const selectedScene = story.scenes.find((scene) => scene.id === draft.sceneId)

  return (
    <SetupSection number="01" title="选择开场" description="你将从这个时刻进入现场。">
      <div className="grid gap-[9px] sm:ml-14">
        {story.scenes.map((scene) => (
          <label
            className={cx(
              'grid min-h-[88px] cursor-pointer grid-cols-[22px_1fr] gap-3.5 rounded-md border border-line bg-surface p-[17px] shadow-[0_1px_3px_rgba(24,32,29,0.03)] hover:border-[#a8b5ad]',
              draft.sceneId === scene.id && 'border-green bg-[#f7fbf8] shadow-[inset_3px_0_var(--color-green)]',
            )}
            key={scene.id}
          >
            <input
              className="pointer-events-none absolute opacity-0"
              type="radio"
              name="scene"
              checked={draft.sceneId === scene.id}
              onChange={() => onChange({ ...draft, sceneId: scene.id })}
            />
            <span
              className={cx(
                'grid size-[19px] place-items-center rounded-full border border-[#aeb2ae] text-white',
                draft.sceneId === scene.id && 'border-green bg-green',
              )}
            >
              {draft.sceneId === scene.id && <Check size={14} />}
            </span>
            <span className="grid gap-1">
              <strong>{scene.title}</strong>
              <small className="flex items-center gap-1 text-muted">
                <MapPin size={13} /> {scene.location} · {scene.time}
              </small>
              <em className="text-xs not-italic text-[#555b57]">{scene.description}</em>
            </span>
          </label>
        ))}
      </div>
      {selectedScene && (
        <blockquote className="mt-[18px] border-l-[3px] border-gold bg-[#f2f1eb] px-5 py-[18px] font-serif text-sm leading-[1.8] font-semibold whitespace-pre-line text-[#505853] sm:ml-14">
          {selectedScene.openingMessage}
        </blockquote>
      )}
    </SetupSection>
  )
}
