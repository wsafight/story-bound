import type { ContextPreview, InputMode } from '@storybound/shared'

export const modeLabels: Record<InputMode, string> = { dialogue: '对话', action: '行动', narration: '旁白' }

export function priorityLabel(priority: NonNullable<ContextPreview['estimate']>['segments'][number]['priority']) {
  if (priority === undefined) return ''
  if (typeof priority === 'number') return `P${priority}`
  return {
    required: '必需',
    high: '高',
    medium: '中',
    low: '低',
  }[priority]
}
