import type { StoryDetail } from '@storybound/shared'
import { UserRound } from 'lucide-react'
import { SetupSection, setupFormGridClass } from '../../components/forms/SetupSectionHeader'
import type { ConversationDraft } from './types'

interface PlayerSectionProps {
  story: StoryDetail
  draft: ConversationDraft
  onChange: (draft: ConversationDraft) => void
}

export function PlayerBlock({ story, draft, onChange }: PlayerSectionProps) {
  return (
    <SetupSection
      number="02"
      title="玩家身份"
      description={`${story.playerTemplate.roleName} · ${story.playerTemplate.goals}`}
    >
      <div className={setupFormGridClass}>
        <label>
          <span>存档名称</span>
          <input
            required
            maxLength={80}
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          <span>你的名字</span>
          <input
            required
            maxLength={40}
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          <span>称谓偏好</span>
          <input
            maxLength={30}
            value={draft.pronouns}
            onChange={(event) => onChange({ ...draft, pronouns: event.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          <span>补充设定（可选）</span>
          <textarea
            maxLength={500}
            rows={3}
            value={draft.note}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
            placeholder="只影响这个存档"
          />
        </label>
      </div>
      <div className="mt-[18px] flex items-start gap-2.5 border border-[#d3e0e6] bg-blue-soft p-3.5 text-xs text-[#53636b] sm:ml-14">
        <UserRound className="shrink-0" size={17} />
        <p className="m-0 leading-[1.6]">{story.playerTemplate.background}</p>
      </div>
    </SetupSection>
  )
}
