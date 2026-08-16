import type {
  Ability,
  Character,
  DeclarativeMod,
  LorebookEntry,
  Scene,
  StoryDetail,
  StoryFact,
  StoryNode,
} from '@storybound/shared'

export type EditorTab = 'basic' | 'characters' | 'player' | 'abilities' | 'state' | 'scenes'
export type DraftCharacter = Character
export type DraftAbility = Ability
export type DraftScene = Scene
export type DraftStoryFact = StoryFact
export type DraftLorebookEntry = LorebookEntry
export type DraftStoryNode = StoryNode
export type DraftDeclarativeMod = DeclarativeMod

export interface StoryDraft {
  version?: number
  title: string
  cover: string
  summary: string
  description: string
  background: string
  worldRules: string
  contentWarnings: string[]
  contentBoundaries: string[]
  tags: string[]
  stateSchema: StoryDetail['stateSchema']
  defaultState: StoryDetail['defaultState']
  statePolicy: StoryDetail['statePolicy']
  characters: DraftCharacter[]
  abilities: DraftAbility[]
  facts: DraftStoryFact[]
  lorebookEntries: DraftLorebookEntry[]
  nodes: DraftStoryNode[]
  declarativeMods: DraftDeclarativeMod[]
  scenes: DraftScene[]
  playerTemplate: StoryDetail['playerTemplate']
}

const firstCharacterId = crypto.randomUUID()

export const blankDraft: StoryDraft = {
  title: '',
  cover: '/covers/rain-terminal.png',
  summary: '',
  description: '',
  background: '',
  worldRules: '',
  contentWarnings: [],
  contentBoundaries: [],
  tags: [],
  stateSchema: { type: 'object', properties: {}, additionalProperties: false },
  defaultState: {},
  statePolicy: [],
  characters: [
    {
      id: firstCharacterId,
      name: '',
      roleType: 'main',
      identity: '',
      appearance: '',
      personality: '',
      speechStyle: '',
      goals: '',
      knowledgeScope: '',
    },
  ],
  abilities: [],
  facts: [],
  lorebookEntries: [],
  nodes: [],
  declarativeMods: [],
  scenes: [
    {
      id: crypto.randomUUID(),
      title: '故事开始',
      description: '',
      location: '',
      time: '',
      participantIds: [firstCharacterId],
      entryMethod: '',
      openingMessage: '',
      openingSender: 'narrator',
      openingCharacterId: null,
      initialState: { phase: '故事开始', custom: {} },
      isDefault: true,
    },
  ],
  playerTemplate: {
    id: crypto.randomUUID(),
    roleName: '',
    background: '',
    goals: '',
    defaultValues: { name: '', pronouns: '不限定', note: '' },
  },
}

export function storyToDraft(story: StoryDetail): StoryDraft {
  return {
    version: story.version,
    title: story.title,
    cover: story.cover,
    summary: story.summary,
    description: story.description,
    background: story.background,
    worldRules: story.worldRules,
    contentWarnings: story.contentWarnings,
    contentBoundaries: story.contentBoundaries,
    tags: story.tags,
    stateSchema: story.stateSchema,
    defaultState: story.defaultState,
    statePolicy: story.statePolicy,
    characters: story.characters,
    abilities: story.abilities,
    facts: story.facts,
    lorebookEntries: story.lorebookEntries,
    nodes: story.nodes,
    declarativeMods: story.declarativeMods,
    scenes: story.scenes,
    playerTemplate: story.playerTemplate,
  }
}
