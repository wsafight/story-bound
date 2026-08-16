import type { Ability } from '@storybound/shared'
import { Check, Sparkles } from 'lucide-react'
import { SetupSection } from '../../components/forms/SetupSectionHeader'
import { cx } from '../../shared/ui'

interface AbilitySectionProps {
  abilities: Ability[]
  selectedIds: string[]
  onToggle: (id: string) => void
}

export function AbilityBlock({ abilities, selectedIds, onToggle }: AbilitySectionProps) {
  return (
    <SetupSection number="03" title="启用能力" description="能力会参与后续故事提示，但不会代替你做决定。">
      <div className="grid gap-2.5 sm:ml-14 sm:grid-cols-2">
        {abilities.map((ability) => (
          <label
            className={cx(
              'grid min-h-[84px] min-w-0 cursor-pointer grid-cols-[20px_1fr_20px] items-start gap-2.5 rounded-md border border-line bg-surface p-[15px]',
              selectedIds.includes(ability.id) && 'border-[#8ca092] bg-[#edf2ee]',
            )}
            key={ability.id}
          >
            <input
              className="pointer-events-none absolute opacity-0"
              type="checkbox"
              checked={selectedIds.includes(ability.id)}
              onChange={() => onToggle(ability.id)}
            />
            <Sparkles size={17} />
            <span className="grid gap-1.5">
              <strong>{ability.name}</strong>
              <small className="leading-[1.55] text-muted">{ability.description}</small>
            </span>
            <span
              className={cx(
                'grid size-[18px] place-items-center rounded-[3px] border border-[#aeb2ae] text-white',
                selectedIds.includes(ability.id) && 'border-green bg-green',
              )}
            >
              {selectedIds.includes(ability.id) && <Check size={13} />}
            </span>
          </label>
        ))}
      </div>
    </SetupSection>
  )
}
