import { z } from 'zod'
import { customStateDefaultsSchema, customStateJsonSchema, statePolicySchema } from './dynamicState'
import { type ContractSchemaOptions, defaultContractOptions } from './options'
import { createRuntimeStateSchema } from './runtimeState'

const storyItemId = z.string().min(1).max(100)
const characterDraftSchema = z.object({
  id: storyItemId.optional(),
  name: z.string().trim().max(80).default(''),
  roleType: z.enum(['main', 'supporting', 'background']).default('supporting'),
  identity: z.string().trim().max(2_000).default(''),
  appearance: z.string().trim().max(2_000).default(''),
  personality: z.string().trim().max(2_000).default(''),
  speechStyle: z.string().trim().max(2_000).default(''),
  goals: z.string().trim().max(2_000).default(''),
  knowledgeScope: z.string().trim().max(2_000).default(''),
})
const abilityDraftSchema = z.object({
  id: storyItemId.optional(),
  name: z.string().trim().max(80).default(''),
  category: z.enum(['player', 'character', 'mechanic']).default('player'),
  description: z.string().trim().max(1_000).default(''),
  prompt: z.string().trim().max(4_000).default(''),
  enabledByDefault: z.boolean().default(true),
  configSchema: customStateJsonSchema,
  inputSchema: customStateJsonSchema,
  resultSchema: customStateJsonSchema,
  runtime: z
    .object({
      usesPerConversation: z.number().int().positive().max(999).nullable().default(null),
      cooldownTurns: z.number().int().min(0).max(99).default(0),
      statePatch: customStateDefaultsSchema,
    })
    .default({ usesPerConversation: null, cooldownTurns: 0, statePatch: {} }),
})

const storyFactDraftSchema = z.object({
  id: storyItemId.optional(),
  title: z.string().trim().max(120).default(''),
  content: z.string().trim().max(2_000).default(''),
  visibility: z.enum(['public', 'secret']).default('public'),
  knownByCharacterIds: z.array(storyItemId).max(30).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
})

const lorebookEntryDraftSchema = z.object({
  id: storyItemId.optional(),
  title: z.string().trim().max(120).default(''),
  content: z.string().trim().max(3_000).default(''),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  condition: z.record(z.string(), z.unknown()).default({}),
  scope: z.enum(['story', 'scene', 'character', 'chapter']).default('story'),
  sceneIds: z.array(storyItemId).max(20).default([]),
  characterIds: z.array(storyItemId).max(30).default([]),
  chapterNumbers: z.array(z.number().int().positive().max(999)).max(50).default([]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  enabled: z.boolean().default(true),
})

const storyNodeDraftSchema = z.object({
  id: storyItemId.optional(),
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(2_000).default(''),
  condition: z.record(z.string(), z.unknown()).default({}),
  prompt: z.string().trim().max(4_000).default(''),
  enabled: z.boolean().default(true),
})

const declarativeModDraftSchema = z.object({
  id: storyItemId.optional(),
  name: z.string().trim().max(120).default(''),
  version: z.string().trim().max(40).default('1.0.0'),
  description: z.string().trim().max(1_000).default(''),
  prompt: z.string().trim().max(4_000).default(''),
  enabledByDefault: z.boolean().default(true),
  configSchema: customStateJsonSchema,
  defaultConfig: customStateDefaultsSchema,
})

export function createStoryDraftSchema(options: ContractSchemaOptions = defaultContractOptions) {
  const sceneStateDraftSchema = createRuntimeStateSchema(options)
  const sceneDraftSchema = z.object({
    id: storyItemId.optional(),
    title: z.string().trim().max(100).default(''),
    description: z.string().trim().max(2_000).default(''),
    location: z.string().trim().max(200).default(''),
    time: z.string().trim().max(200).default(''),
    participantIds: z.array(storyItemId).max(30).default([]),
    entryMethod: z.string().trim().max(1_000).default(''),
    openingMessage: z.string().trim().max(options.maxMessageChars).default(''),
    openingSender: z.enum(['character', 'narrator']).default('narrator'),
    openingCharacterId: storyItemId.nullable().default(null),
    initialState: sceneStateDraftSchema.default({}),
    isDefault: z.boolean().default(false),
  })

  return z.object({
    version: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(120),
    cover: z.string().trim().max(1_000).default(''),
    summary: z.string().trim().max(500).default(''),
    description: z.string().trim().max(8_000).default(''),
    background: z.string().trim().max(30_000).default(''),
    worldRules: z.string().trim().max(20_000).default(''),
    contentWarnings: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    contentBoundaries: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    stateSchema: customStateJsonSchema,
    defaultState: customStateDefaultsSchema,
    statePolicy: statePolicySchema,
    characters: z.array(characterDraftSchema).max(30).default([]),
    abilities: z.array(abilityDraftSchema).max(30).default([]),
    facts: z.array(storyFactDraftSchema).max(100).default([]),
    lorebookEntries: z.array(lorebookEntryDraftSchema).max(200).default([]),
    nodes: z.array(storyNodeDraftSchema).max(100).default([]),
    declarativeMods: z.array(declarativeModDraftSchema).max(50).default([]),
    scenes: z.array(sceneDraftSchema).max(20).default([]),
    playerTemplate: z
      .object({
        id: storyItemId.optional(),
        roleName: z.string().trim().max(120).default(''),
        background: z.string().trim().max(4_000).default(''),
        goals: z.string().trim().max(2_000).default(''),
        defaultValues: z
          .object({
            name: z.string().max(80).optional(),
            pronouns: z.string().max(40).optional(),
            note: z.string().max(500).optional(),
          })
          .default({}),
      })
      .default({ roleName: '', background: '', goals: '', defaultValues: {} }),
  })
}

export const storyDraftSchema = createStoryDraftSchema()
export type StoryDraftInput = z.infer<typeof storyDraftSchema>
