import { z } from 'zod'

export const narrativePreferencesSchema = z
  .object({
    perspective: z
      .enum(['first_player', 'second_player', 'third_player', 'first_character', 'third_character', 'third_omniscient'])
      .default('second_player'),
    viewpointCharacterId: z.string().min(1).nullable().default(null),
    tense: z.enum(['present', 'past']).default('present'),
    length: z.enum(['compact', 'balanced', 'expanded']).default('balanced'),
    dialogueDensity: z.enum(['low', 'balanced', 'high']).default('balanced'),
  })
  .superRefine((value, context) => {
    const needsCharacter = value.perspective === 'first_character' || value.perspective === 'third_character'
    if (needsCharacter && !value.viewpointCharacterId) {
      context.addIssue({
        code: 'custom',
        path: ['viewpointCharacterId'],
        message: '人物视角需要选择一个故事人物',
      })
    }
  })

export type NarrativePreferences = z.infer<typeof narrativePreferencesSchema>
