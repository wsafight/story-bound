import { z } from 'zod'
import { continuityGuardMod } from './mods/continuityGuard'
import { narrativePerspectiveId, narrativePerspectiveMod } from './mods/narrativePerspective'
import { narrativeStyleMod } from './mods/narrativeStyle'
import { pacingDirectorMod } from './mods/pacingDirector'
import type { TrustedModDefinition } from './mods/types'

export type { ModActivationPolicy, ModConfigField, TrustedModDefinition } from './mods/types'

export const trustedMods: TrustedModDefinition[] = [
  narrativePerspectiveMod,
  narrativeStyleMod,
  continuityGuardMod,
  pacingDirectorMod,
]

export function getTrustedMod(modId: string) {
  return trustedMods.find((mod) => mod.id === modId)
}

export function validateModConfigForStory(
  modId: string,
  input: Record<string, unknown>,
  characters: Array<{ id?: unknown }> = [],
) {
  const definition = getTrustedMod(modId)
  if (!definition) throw new Error(`Unknown trusted MOD: ${modId}`)
  const config = definition.schema.parse(input)
  if (
    modId === narrativePerspectiveId &&
    new Set(['first_character', 'third_character']).has(String(config.perspective))
  ) {
    const characterId = String(config.viewpointCharacterId || '')
    if (!characters.some((character) => String(character.id) === characterId)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['viewpointCharacterId'],
          message: '视角人物不属于当前故事',
        },
      ])
    }
  }
  return config
}
