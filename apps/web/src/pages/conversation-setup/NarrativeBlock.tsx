import type { NarrativePreferences, StoryDetail } from '@storybound/shared'
import { BookOpenText } from 'lucide-react'
import { SetupSection, setupFormGridClass } from '../../components/forms/SetupSectionHeader'
import type { ConversationDraft } from './types'

interface NarrativeSectionProps {
  story: StoryDetail
  draft: ConversationDraft
  onChange: (draft: ConversationDraft) => void
}

export function NarrativeBlock({ story, draft, onChange }: NarrativeSectionProps) {
  const updateNarrative = (values: Partial<NarrativePreferences>) =>
    onChange({ ...draft, narrative: { ...draft.narrative, ...values } })

  return (
    <SetupSection number="04" title="叙事方式" description="这些规则从第一轮续写开始生效，之后可以在存档中调整。">
      <div className={setupFormGridClass}>
        <label className="sm:col-span-2">
          <span className="flex items-center gap-1.5">
            <BookOpenText size={14} /> 叙事视角
          </span>
          <select
            value={draft.narrative.perspective}
            onChange={(event) => {
              const perspective = event.target.value as NarrativePreferences['perspective']
              const needsCharacter = perspective === 'first_character' || perspective === 'third_character'
              updateNarrative({
                perspective,
                viewpointCharacterId: needsCharacter
                  ? draft.narrative.viewpointCharacterId || story.characters[0]?.id || null
                  : null,
              })
            }}
          >
            <option value="first_player">玩家第一人称</option>
            <option value="second_player">玩家第二人称</option>
            <option value="third_player">玩家第三人称</option>
            <option value="first_character" disabled={story.characters.length === 0}>
              指定人物第一人称
            </option>
            <option value="third_character" disabled={story.characters.length === 0}>
              指定人物第三人称
            </option>
            <option value="third_omniscient">第三人称全知</option>
          </select>
        </label>
        {(draft.narrative.perspective === 'first_character' || draft.narrative.perspective === 'third_character') && (
          <label>
            <span>视角人物</span>
            <select
              required
              value={draft.narrative.viewpointCharacterId || ''}
              onChange={(event) => updateNarrative({ viewpointCharacterId: event.target.value })}
            >
              {story.characters.map((character) => (
                <option value={character.id} key={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>叙事时态</span>
          <select
            value={draft.narrative.tense}
            onChange={(event) => updateNarrative({ tense: event.target.value as NarrativePreferences['tense'] })}
          >
            <option value="present">当下感</option>
            <option value="past">过去式</option>
          </select>
        </label>
        <label>
          <span>回复篇幅</span>
          <select
            value={draft.narrative.length}
            onChange={(event) => updateNarrative({ length: event.target.value as NarrativePreferences['length'] })}
          >
            <option value="compact">紧凑</option>
            <option value="balanced">适中</option>
            <option value="expanded">展开</option>
          </select>
        </label>
        <label>
          <span>对白密度</span>
          <select
            value={draft.narrative.dialogueDensity}
            onChange={(event) =>
              updateNarrative({ dialogueDensity: event.target.value as NarrativePreferences['dialogueDensity'] })
            }
          >
            <option value="low">少量</option>
            <option value="balanced">均衡</option>
            <option value="high">较多</option>
          </select>
        </label>
      </div>
    </SetupSection>
  )
}
