import { z } from 'zod'
import { customStateDefaultsSchema, customStateJsonSchema, statePolicySchema } from '../schemas/dynamicState'
import { runtimeStateSchema } from '../schemas/runtimeState'

export const recordSchema = z.record(z.string(), z.unknown())
const nullableString = z.string().nullable()
export const pageSchema = z.object({ hasMore: z.boolean(), nextCursor: nullableString })
export const inputModeSchema = z.enum(['dialogue', 'action', 'narration'])
const promptOmittedReasonSchema = z.enum([
  'budget_exceeded',
  'condition_not_matched',
  'disabled',
  'empty',
  'conflict_with_core_rule',
  'short_term_window',
])

export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: nullableString.optional(),
  roleType: z.enum(['main', 'supporting', 'background']),
  identity: z.string(),
  appearance: z.string(),
  personality: z.string(),
  speechStyle: z.string(),
  goals: z.string(),
  knowledgeScope: z.string(),
})

export const abilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['player', 'character', 'mechanic']),
  description: z.string(),
  prompt: z.string(),
  enabledByDefault: z.boolean(),
  configSchema: customStateJsonSchema,
  inputSchema: customStateJsonSchema,
  resultSchema: customStateJsonSchema,
  runtime: z
    .object({
      usesPerConversation: z.number().int().positive().nullable(),
      cooldownTurns: z.number().int().min(0),
      statePatch: customStateDefaultsSchema,
    })
    .default({ usesPerConversation: null, cooldownTurns: 0, statePatch: {} }),
})

export const storyFactSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  visibility: z.enum(['public', 'secret']),
  knownByCharacterIds: z.array(z.string()),
  tags: z.array(z.string()),
})

export const lorebookEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  condition: recordSchema,
  scope: z.enum(['story', 'scene', 'character', 'chapter']).default('story'),
  sceneIds: z.array(z.string()).default([]),
  characterIds: z.array(z.string()).default([]),
  chapterNumbers: z.array(z.number().int().positive()).default([]),
  priority: z.enum(['high', 'medium', 'low']),
  enabled: z.boolean(),
})

export const storyNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  condition: recordSchema,
  prompt: z.string(),
  enabled: z.boolean(),
})

export const declarativeModSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  prompt: z.string(),
  enabledByDefault: z.boolean(),
  configSchema: customStateJsonSchema,
  defaultConfig: customStateDefaultsSchema,
})

export const sceneStateSchema = runtimeStateSchema

export const sceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  time: z.string(),
  participantIds: z.array(z.string()),
  entryMethod: z.string(),
  openingMessage: z.string(),
  openingSender: z.enum(['character', 'narrator']),
  openingCharacterId: nullableString,
  initialState: sceneStateSchema,
  isDefault: z.boolean(),
})

export const storySummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  conversationCount: z.number(),
  lastPlayedAt: nullableString,
  recentConversationId: nullableString,
  isBuiltin: z.boolean(),
  status: z.enum(['draft', 'active', 'archived']),
})

export const storyDetailSchema = storySummarySchema.extend({
  lastPlayedAt: nullableString.optional(),
  recentConversationId: nullableString.optional(),
  description: z.string(),
  background: z.string(),
  worldRules: z.string(),
  contentWarnings: z.array(z.string()),
  contentBoundaries: z.array(z.string()),
  version: z.number(),
  stateSchema: customStateJsonSchema,
  defaultState: customStateDefaultsSchema,
  statePolicy: statePolicySchema,
  characters: z.array(characterSchema),
  abilities: z.array(abilitySchema),
  facts: z.array(storyFactSchema),
  lorebookEntries: z.array(lorebookEntrySchema),
  nodes: z.array(storyNodeSchema),
  declarativeMods: z.array(declarativeModSchema),
  scenes: z.array(sceneSchema),
  playerTemplate: z.object({
    id: z.string(),
    roleName: z.string(),
    background: z.string(),
    goals: z.string(),
    defaultValues: z.object({
      name: z.string().optional(),
      pronouns: z.string().optional(),
      note: z.string().optional(),
    }),
  }),
})

export const lintIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  path: z.string(),
  message: z.string(),
})

export const conversationStateSchema = runtimeStateSchema

export const conversationListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['active', 'completed', 'archived']),
  state: conversationStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const storyMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  chapterId: z.string(),
  parentMessageId: nullableString,
  generationId: nullableString,
  sender: z.enum(['player', 'character', 'narrator']),
  characterId: nullableString,
  inputMode: inputModeSchema.nullable(),
  content: z.string(),
  createdAt: z.string(),
})

export const replyCandidateSchema = z.object({
  id: z.string(),
  message: storyMessageSchema,
  checkpointId: z.string(),
  generationId: nullableString,
  attempt: z.number().nullable(),
  model: nullableString,
  isActive: z.boolean(),
  selectable: z.boolean(),
  blockedReason: z.enum(['ACTIVE', 'HAS_CONTINUATION', 'GENERATION_NOT_COMPLETED']).nullable(),
  childCount: z.number(),
  createdAt: z.string(),
})

export const stateDiffEntrySchema = z.object({
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  beforeMissing: z.boolean().optional(),
  afterMissing: z.boolean().optional(),
})

export const stateSuggestionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  patch: recordSchema,
  diff: z.array(stateDiffEntrySchema).default([]),
  source: z.enum(['model', 'user', 'system']),
  status: z.enum(['pending', 'accepted', 'rejected']),
  createdAt: z.string(),
  resolvedAt: nullableString.optional(),
})

export const stateFieldHintSchema = z.object({
  path: z.string(),
  key: z.string(),
  label: z.string(),
  type: z.string(),
  description: z.string(),
  value: z.unknown(),
  playerEditable: z.boolean(),
  storyEditable: z.boolean(),
  appManaged: z.boolean(),
  protectedReason: nullableString,
})

export const lorebookDiagnosticSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  scope: z.enum(['story', 'scene', 'character', 'chapter']),
  priority: z.enum(['high', 'medium', 'low']),
  enabled: z.boolean(),
  matched: z.boolean(),
  matchedKeywords: z.array(z.string()),
  reasons: z.array(
    z.enum(['matched', 'disabled', 'scope_not_matched', 'condition_not_matched', 'keyword_not_matched']),
  ),
})

export const nodeDiagnosticSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  status: z.enum(['locked', 'available', 'active', 'completed', 'skipped']),
  enabled: z.boolean(),
  conditionMatched: z.boolean(),
  prompt: z.string(),
  description: z.string(),
  updatedAt: nullableString,
  availableActions: z.array(z.enum(['activate', 'deactivate', 'complete', 'skip'])),
  blockedReason: nullableString,
  reachability: z.object({
    reachable: z.boolean(),
    terminal: z.boolean(),
    blockedReasons: z.array(z.string()),
    transitions: z.array(
      z.object({
        action: z.enum(['activate', 'deactivate', 'complete', 'skip']),
        toStatus: z.enum(['locked', 'available', 'active', 'completed', 'skipped']),
      }),
    ),
  }),
})

export const promptBlockDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.enum([
    'core',
    'story',
    'state',
    'fact',
    'lorebook',
    'memory',
    'node',
    'ability',
    'director',
    'mod',
    'history',
    'input',
  ]),
  scope: z.enum(['app', 'story', 'conversation', 'chapter', 'scene', 'turn']),
  priority: z.enum(['required', 'high', 'medium', 'low']),
  budgetRatio: z.number().nullable(),
  sourceLabel: z.string(),
  scopeLabel: z.string(),
})

export const promptProfileSchema = z.object({
  id: z.string(),
  version: z.number(),
  hash: z.string(),
  locale: z.string(),
  textHash: z.string(),
  style: z.object({
    language: z.string(),
    pacing: z.string(),
    outputBoundaries: z.array(z.string()),
  }),
  blockOrder: z.array(z.string()),
  blocks: z.array(promptBlockDefinitionSchema),
})

export const storyImportIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string(),
  path: z.string(),
  message: z.string(),
})

export const storyImportReportSchema = z.object({
  format: z.string(),
  formatVersion: z.number().nullable(),
  adapter: z.enum(['storybound', 'sillytavern-character', 'unsupported']),
  canImport: z.boolean(),
  dryRun: z.boolean(),
  storyTitle: z.string(),
  counts: z.object({
    characters: z.number(),
    abilities: z.number(),
    scenes: z.number(),
    facts: z.number(),
    lorebookEntries: z.number(),
    nodes: z.number(),
    declarativeMods: z.number(),
  }),
  issues: z.array(storyImportIssueSchema),
  unknownTopLevelFields: z.array(z.string()),
  mediaFiles: z.array(z.string()),
  conversion: z.object({
    lossy: z.boolean(),
    warnings: z.array(z.string()),
  }),
})

export const conversationBranchNodeSchema = z.object({
  message: storyMessageSchema,
  parentMessageId: nullableString,
  depth: z.number(),
  childCount: z.number(),
  siblingIndex: z.number(),
  onActivePath: z.boolean(),
  isActiveLeaf: z.boolean(),
})

export const conversationBranchSchema = z.object({
  activePathIds: z.array(z.string()),
  nodes: z.array(conversationBranchNodeSchema),
  branchPoints: z.array(z.object({ messageId: z.string(), childCount: z.number() })),
  source: z
    .object({
      sourceConversationId: z.string().optional(),
      sourceMessageId: z.string().optional(),
      childConversationId: z.string().optional(),
    })
    .nullable(),
})

export const replyCandidateComparisonSchema = z.object({
  activeParentMessageId: nullableString,
  candidates: z.array(
    replyCandidateSchema.extend({
      siblingIndex: z.number(),
      estimatedTokens: z.number(),
      contentPreview: z.string(),
    }),
  ),
})

export const recallDiagnosticItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.enum(['lorebook', 'pinned_memory', 'chapter_summary', 'long_term_memory']),
  boundary: z.enum(['background_lore', 'confirmed_memory', 'chapter_summary', 'long_term_memory']),
  matched: z.boolean(),
  relevanceScore: z.number(),
  matchedTerms: z.array(z.string()),
  contentPreview: z.string(),
  reasons: z.array(
    z.enum([
      'matched',
      'query_empty',
      'disabled',
      'scope_not_matched',
      'condition_not_matched',
      'keyword_not_matched',
      'low_relevance',
    ]),
  ),
})

export const recallQualityReportSchema = z.object({
  query: z.string(),
  engine: z.object({
    active: z.enum(['lexical']),
    fts5Ready: z.boolean(),
    sources: z.array(
      z.object({
        id: z.enum(['lorebook', 'pinned_memory', 'chapter_summary', 'long_term_memory']),
        label: z.string(),
        boundary: z.enum(['background_lore', 'confirmed_memory', 'chapter_summary', 'long_term_memory']),
        engine: z.enum(['lexical']),
        fts5Ready: z.boolean(),
      }),
    ),
  }),
  totalItems: z.number(),
  matchedItems: z.number(),
  diagnostics: z.array(recallDiagnosticItemSchema),
  warnings: z.array(z.string()),
})

export const promptAuditCheckSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['passed', 'warning', 'failed']),
  message: z.string(),
})

export const promptGoldenScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  requiredBlockIds: z.array(z.string()),
  expectedIncludedBlockIds: z.array(z.string()).optional(),
  expectedOrder: z.array(z.string()),
  assertions: z.array(z.string()),
})

export const promptAuditSchema = z.object({
  profile: promptProfileSchema,
  totalBudgetRatio: z.number(),
  checks: z.array(promptAuditCheckSchema),
  goldenScenarios: z.array(promptGoldenScenarioSchema),
})

export const conversationEventSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  anchorMessageId: nullableString,
  checkpointId: nullableString,
  kind: z.enum([
    'mod_enabled',
    'mod_disabled',
    'mod_configured',
    'memory_pinned',
    'memory_unpinned',
    'chapter_closed',
    'state_updated',
    'ability_used',
    'state_suggestion_created',
    'state_suggestion_accepted',
    'state_suggestion_rejected',
    'node_progress_updated',
    'conversation_forked',
  ]),
  payload: z
    .object({
      modId: z.string().optional(),
      modName: z.string().optional(),
      version: z.string().optional(),
      config: recordSchema.optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      abilityId: z.string().optional(),
      abilityName: z.string().optional(),
      suggestionId: z.string().optional(),
      nodeId: z.string().optional(),
      nodeTitle: z.string().optional(),
      patch: recordSchema.optional(),
      diff: z.array(stateDiffEntrySchema).optional(),
    })
    .catchall(z.unknown()),
  createdAt: z.string(),
})

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['active', 'completed', 'archived']),
  createdAt: z.string(),
  updatedAt: z.string(),
  activeLeafMessageId: z.string(),
  activeCheckpointId: z.string(),
  story: z
    .object({
      id: z.string(),
      title: z.string(),
      cover: z.string(),
      summary: z.string(),
      background: z.string(),
      worldRules: z.string(),
      contentBoundaries: z.array(z.string()),
      characters: z.array(characterSchema),
      facts: z.array(storyFactSchema).optional(),
      lorebookEntries: z.array(lorebookEntrySchema).optional(),
      nodes: z.array(storyNodeSchema).optional(),
      declarativeMods: z.array(declarativeModSchema).optional(),
      version: z.number(),
    })
    .catchall(z.unknown()),
  player: z
    .object({
      name: z.string(),
      pronouns: z.string(),
      roleName: z.string(),
      background: z.string(),
      goals: z.string(),
      note: z.string(),
    })
    .catchall(z.unknown()),
  abilities: z.array(abilitySchema),
  scene: sceneSchema,
  state: conversationStateSchema,
  messages: z.array(storyMessageSchema),
  events: z.array(conversationEventSchema),
  replyCandidates: z.array(replyCandidateSchema),
  messagePage: pageSchema,
  activeGeneration: z.object({ id: z.string(), status: z.string(), errorCode: nullableString }).nullable(),
  currentChapter: z.object({ id: z.string(), number: z.number(), title: z.string(), status: z.string() }).nullable(),
})

export const modelHealthSchema = z.object({
  online: z.boolean(),
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  model: z.string(),
  models: z.array(z.string()),
  reason: z.string().optional(),
  checkedAt: z.string().optional(),
})

export const modelProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['local', 'remote']),
  baseUrl: z.string(),
  defaultModel: z.string(),
  contextWindow: z.number(),
  maxOutputTokens: z.number(),
  thinkingMode: z.enum(['off', 'auto', 'on']),
  thinkingEffort: z.enum(['low', 'medium', 'high']).nullable(),
  isDefault: z.boolean(),
  hasCredential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const modConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['select', 'boolean', 'character-select', 'number']),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  visibleWhen: z.object({ key: z.string(), values: z.array(z.string()) }).optional(),
})

export const runtimeModSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  activationPolicy: z.enum(['immediate', 'next_chapter']),
  configFields: z.array(modConfigFieldSchema),
  enabled: z.boolean(),
  defaultConfig: recordSchema,
  configVersion: z.number(),
  activeConversations: z.number(),
  runtime: z.object({
    loaded: z.boolean(),
    state: z.string(),
    effectCount: z.number(),
    startedAt: nullableString,
  }),
})

export const conversationModSchema = runtimeModSchema.extend({ active: z.boolean(), config: recordSchema })

export const runtimeStatusSchema = z.object({
  engine: z.literal('Cordis'),
  version: z.string(),
  plugins: z.array(z.object({ name: z.string(), instances: z.number(), states: z.array(z.string()) })),
  generations: z.object({ active: z.number(), completed: z.number(), failed: z.number() }),
  scheduler: z.object({ active: z.number(), limit: z.number() }),
  metrics: z.object({
    accepted: z.number(),
    completed: z.number(),
    failed: z.number(),
    active: z.number(),
    successRate: z.number().nullable(),
    averageDurationMs: z.number().nullable(),
    tokens: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), reasoning: z.number() }),
    failuresByCode: z.record(z.string(), z.number()),
  }),
  background: z
    .object({
      enabled: z.object({ maintenance: z.boolean(), providerHealth: z.boolean(), autoBackup: z.boolean() }),
      maintenanceRuns: z.number(),
      healthRuns: z.number(),
      backupRuns: z.number(),
      failures: z.number(),
      lastMaintenanceAt: nullableString,
      lastHealthAt: nullableString,
      lastBackupAt: nullableString,
    })
    .nullable(),
})

export const contextPreviewSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  estimate: z
    .object({
      contextWindow: z.number(),
      outputReserved: z.number(),
      envelopeReserved: z.number(),
      requestBudget: z.number(),
      estimatedTokens: z.number(),
      segments: z.array(
        z.object({
          name: z.string(),
          estimatedTokens: z.number(),
          includedItems: z.number().optional(),
          omittedItems: z.number().optional(),
          source: z.string().optional(),
          scope: z.string().optional(),
          priority: z.union([z.enum(['required', 'high', 'medium', 'low']), z.number()]).optional(),
          budget: z.number().optional(),
          included: z.boolean().optional(),
          reason: promptOmittedReasonSchema.optional(),
        }),
      ),
      history: z.object({ includedMessages: z.number(), omittedMessages: z.number(), estimatedTokens: z.number() }),
      promptSnapshot: z
        .object({
          version: z.literal(1),
          compiler: z.literal('storybound.prompt-blocks'),
          promptHash: z.string(),
          finalSystemHash: z.string(),
          blocks: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              source: z.enum([
                'core',
                'story',
                'state',
                'fact',
                'lorebook',
                'memory',
                'node',
                'ability',
                'director',
                'mod',
                'history',
                'input',
              ]),
              scope: z.enum(['app', 'story', 'conversation', 'chapter', 'scene', 'turn']),
              priority: z.enum(['required', 'high', 'medium', 'low']),
              tokenEstimate: z.number(),
              hash: z.string(),
              dependencies: z.array(z.string()),
              budget: z.number().optional(),
              included: z.boolean(),
              reason: promptOmittedReasonSchema.optional(),
              includedItems: z.number().optional(),
              omittedItems: z.number().optional(),
            }),
          ),
          historyMessageIds: z.array(z.string()),
          budget: z.object({
            contextWindow: z.number(),
            outputReserved: z.number(),
            envelopeReserved: z.number(),
            requestBudget: z.number(),
          }),
          profile: z.object({
            id: z.string(),
            version: z.number(),
            hash: z.string(),
          }),
          createdAt: z.string(),
        })
        .optional(),
      calibration: z
        .object({
          actualInputTokens: z.number(),
          estimateErrorTokens: z.number(),
          estimateErrorRatio: z.number(),
          measuredAt: z.string(),
        })
        .optional(),
    })
    .optional(),
  prompt: z
    .object({
      system: z.string(),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
      contributions: z.array(
        z.object({
          id: z.string(),
          modId: z.string(),
          label: z.string(),
          section: z.string(),
          priority: z.number(),
          required: z.boolean(),
          content: z.string(),
          estimatedTokens: z.number(),
          included: z.boolean(),
          reason: promptOmittedReasonSchema.optional(),
        }),
      ),
    })
    .optional(),
})

export const backupItemSchema = z.object({ name: z.string(), size: z.number(), createdAt: z.string() })

export const generationSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  playerMessageId: z.string(),
  status: z.string(),
  errorCode: nullableString,
  model: z.string(),
  finishReason: nullableString,
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number().nullable(),
      cacheReadTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
    })
    .nullable(),
  firstTokenAt: nullableString,
  providerRequestId: nullableString,
  retryAfterMs: z.number().nullable(),
  contextEstimate: recordSchema,
  createdAt: z.string(),
  startedAt: nullableString,
  finishedAt: nullableString,
})

export const generationStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('accepted'),
    data: z.object({ generationId: z.string(), playerMessageId: z.string(), playerMessage: storyMessageSchema }),
  }),
  z.object({ event: z.literal('delta'), data: z.object({ generationId: z.string(), text: z.string() }) }),
  z.object({
    event: z.literal('completed'),
    data: z.object({
      generationId: z.string(),
      message: storyMessageSchema,
      activeLeafMessageId: z.string(),
      activeCheckpointId: z.string(),
      updatedAt: z.string(),
    }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ generationId: z.string(), code: z.string(), message: z.string(), retryable: z.boolean() }),
  }),
])

export type InputMode = z.infer<typeof inputModeSchema>
export type Character = z.infer<typeof characterSchema>
export type Ability = z.infer<typeof abilitySchema>
export type StoryFact = z.infer<typeof storyFactSchema>
export type LorebookEntry = z.infer<typeof lorebookEntrySchema>
export type StoryNode = z.infer<typeof storyNodeSchema>
export type DeclarativeMod = z.infer<typeof declarativeModSchema>
export type Scene = z.infer<typeof sceneSchema>
export type StateSuggestionItem = z.infer<typeof stateSuggestionItemSchema>
export type StateFieldHint = z.infer<typeof stateFieldHintSchema>
export type LorebookDiagnostic = z.infer<typeof lorebookDiagnosticSchema>
export type NodeDiagnostic = z.infer<typeof nodeDiagnosticSchema>
export type PromptProfile = z.infer<typeof promptProfileSchema>
export type StoryImportReport = z.infer<typeof storyImportReportSchema>
export type ConversationBranch = z.infer<typeof conversationBranchSchema>
export type ReplyCandidateComparison = z.infer<typeof replyCandidateComparisonSchema>
export type RecallQualityReport = z.infer<typeof recallQualityReportSchema>
export type PromptAudit = z.infer<typeof promptAuditSchema>
export type StorySummary = z.infer<typeof storySummarySchema>
export type StoryDetail = z.infer<typeof storyDetailSchema>
export type LintIssue = z.infer<typeof lintIssueSchema>
export type ConversationState = z.infer<typeof conversationStateSchema>
export type ConversationListItem = z.infer<typeof conversationListItemSchema>
export type StoryMessage = z.infer<typeof storyMessageSchema>
export type ReplyCandidate = z.infer<typeof replyCandidateSchema>
export type ConversationEvent = z.infer<typeof conversationEventSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type ModelHealth = z.infer<typeof modelHealthSchema>
export type ModelProvider = z.infer<typeof modelProviderSchema>
export type ModConfigField = z.infer<typeof modConfigFieldSchema>
export type RuntimeMod = z.infer<typeof runtimeModSchema>
export type ConversationMod = z.infer<typeof conversationModSchema>
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>
export type ContextPreview = z.infer<typeof contextPreviewSchema>
export type BackupItem = z.infer<typeof backupItemSchema>
export type Generation = z.infer<typeof generationSchema>
export type GenerationStreamEvent = z.infer<typeof generationStreamEventSchema>
