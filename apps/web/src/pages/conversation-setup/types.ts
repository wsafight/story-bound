import type { NarrativePreferences } from '@storybound/shared'

export interface ConversationDraft {
  title: string
  sceneId: string
  name: string
  pronouns: string
  note: string
  abilityIds: string[]
  providerId: string
  narrative: NarrativePreferences
}
