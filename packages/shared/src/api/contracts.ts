import { z } from 'zod'
import {
  abilitySchema,
  backupItemSchema,
  contextPreviewSchema,
  conversationBranchSchema,
  conversationEventSchema,
  conversationListItemSchema,
  conversationModSchema,
  conversationSchema,
  conversationStateSchema,
  generationSchema,
  lintIssueSchema,
  lorebookDiagnosticSchema,
  modelHealthSchema,
  modelProviderSchema,
  nodeDiagnosticSchema,
  pageSchema,
  promptAuditSchema,
  promptProfileSchema,
  recallQualityReportSchema,
  recordSchema,
  replyCandidateComparisonSchema,
  replyCandidateSchema,
  runtimeModSchema,
  runtimeStatusSchema,
  stateFieldHintSchema,
  stateSuggestionItemSchema,
  storyDetailSchema,
  storyImportReportSchema,
  storyMessageSchema,
  storySummarySchema,
} from './entities'

export interface ApiContract<Schema extends z.ZodType = z.ZodType> {
  path: string
  response: Schema
}

export type ApiContractResponse<Contract extends ApiContract> = z.output<Contract['response']>

function contract<Schema extends z.ZodType>(path: string, response: Schema): ApiContract<Schema> {
  return { path, response }
}

const storyResponse = z.object({ story: storyDetailSchema })
const storyWithIssuesResponse = z.object({ story: storyDetailSchema, issues: z.array(lintIssueSchema) })
const providerResponse = z.object({ provider: modelProviderSchema })

export const apiContracts = {
  access: () =>
    contract('/api/access', z.object({ access: z.object({ protected: z.boolean(), networkExposed: z.boolean() }) })),
  stories: () => contract('/api/story-cards', z.object({ stories: z.array(storySummarySchema) })),
  lintStory: () => contract('/api/story-cards/lint', z.object({ issues: z.array(lintIssueSchema) })),
  importStory: () =>
    contract(
      '/api/story-cards/import/json',
      z.object({ report: storyImportReportSchema, story: storyDetailSchema.optional() }),
    ),
  createStory: () => contract('/api/story-cards', storyWithIssuesResponse),
  story: (storyId: string) => contract(`/api/story-cards/${storyId}`, storyResponse),
  storyEditor: (storyId: string) => contract(`/api/story-cards/${storyId}/editor`, storyResponse),
  updateStory: (storyId: string) => contract(`/api/story-cards/${storyId}`, storyWithIssuesResponse),
  publishStory: (storyId: string) => contract(`/api/story-cards/${storyId}/publish`, storyWithIssuesResponse),
  duplicateStory: (storyId: string) => contract(`/api/story-cards/${storyId}/duplicate`, storyResponse),
  deleteStory: (storyId: string) => contract(`/api/story-cards/${storyId}`, z.undefined()),
  storyConversations: (storyId: string) =>
    contract(
      `/api/story-cards/${storyId}/conversations`,
      z.object({ conversations: z.array(conversationListItemSchema) }),
    ),
  createConversation: (storyId: string) =>
    contract(`/api/story-cards/${storyId}/conversations`, z.object({ conversation: conversationSchema })),
  conversation: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}`, z.object({ conversation: conversationSchema })),
  updateConversation: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}`,
      z.object({
        conversation: z.object({
          id: z.string(),
          title: z.string(),
          status: z.enum(['active', 'archived']),
        }),
      }),
    ),
  updateConversationState: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/state`,
      z.object({
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        event: conversationEventSchema,
        updatedAt: z.string(),
      }),
    ),
  forkConversation: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/fork`, z.object({ conversation: conversationSchema })),
  useAbility: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/abilities/use`,
      z.object({
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        event: conversationEventSchema,
        updatedAt: z.string(),
      }),
    ),
  createStateSuggestion: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/state-suggestions`,
      z.object({
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        event: conversationEventSchema,
        updatedAt: z.string(),
      }),
    ),
  stateSuggestions: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/state-suggestions`,
      z.object({ suggestions: z.array(stateSuggestionItemSchema) }),
    ),
  stateHints: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/state-hints`, z.object({ fields: z.array(stateFieldHintSchema) })),
  resolveStateSuggestion: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/state-suggestions/resolve`,
      z.object({
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        event: conversationEventSchema,
        updatedAt: z.string(),
      }),
    ),
  lorebookDiagnostics: (conversationId: string, currentInput?: string) =>
    contract(
      `/api/conversations/${conversationId}/lorebook-diagnostics${
        currentInput ? `?input=${encodeURIComponent(currentInput)}` : ''
      }`,
      z.object({ diagnostics: z.array(lorebookDiagnosticSchema) }),
    ),
  recallDiagnostics: (conversationId: string, currentInput?: string) =>
    contract(
      `/api/conversations/${conversationId}/recall-diagnostics${
        currentInput ? `?input=${encodeURIComponent(currentInput)}` : ''
      }`,
      z.object({ recall: recallQualityReportSchema }),
    ),
  nodes: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/nodes`, z.object({ nodes: z.array(nodeDiagnosticSchema) })),
  updateNodeProgress: (
    conversationId: string,
    nodeId: string,
    action: 'activate' | 'deactivate' | 'complete' | 'skip',
  ) =>
    contract(
      `/api/conversations/${conversationId}/nodes/${nodeId}/${action}`,
      z.object({
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        event: conversationEventSchema,
        updatedAt: z.string(),
      }),
    ),
  conversationModelHealth: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/model-health`, z.object({ health: modelHealthSchema })),
  toggleMemory: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/memories/toggle`,
      z.object({
        pinned: z.boolean(),
        messageId: z.string(),
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        updatedAt: z.string(),
      }),
    ),
  closeChapter: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/chapters/close`,
      z.object({
        activeCheckpointId: z.string(),
        currentChapter: z.object({ id: z.string(), number: z.number(), title: z.string(), status: z.string() }),
        state: conversationStateSchema,
        updatedAt: z.string(),
      }),
    ),
  conversationMods: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/mods`, z.object({ mods: z.array(conversationModSchema) })),
  updateConversationMod: (conversationId: string, modId: string) =>
    contract(
      `/api/conversations/${conversationId}/mods/${modId}`,
      z.object({
        mod: conversationModSchema,
        event: conversationEventSchema.nullable(),
        activeCheckpointId: z.string(),
      }),
    ),
  conversationMessages: (conversationId: string, before?: string, limit?: number) => {
    const query = [before ? `before=${encodeURIComponent(before)}` : '', limit === undefined ? '' : `limit=${limit}`]
      .filter(Boolean)
      .join('&')
    return contract(
      `/api/conversations/${conversationId}/messages${query ? `?${query}` : ''}`,
      z.object({
        messages: z.array(storyMessageSchema),
        events: z.array(conversationEventSchema),
        page: pageSchema,
      }),
    )
  },
  replyCandidates: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/reply-candidates`,
      z.object({ candidates: z.array(replyCandidateSchema) }),
    ),
  replyCandidateComparison: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/reply-candidates/compare`,
      z.object({ comparison: replyCandidateComparisonSchema }),
    ),
  selectReplyCandidate: (conversationId: string) =>
    contract(
      `/api/conversations/${conversationId}/reply-candidates/select`,
      z.object({
        activeLeafMessageId: z.string(),
        activeCheckpointId: z.string(),
        state: conversationStateSchema,
        abilities: z.array(abilitySchema),
        modSnapshot: recordSchema,
        message: storyMessageSchema,
        updatedAt: z.string(),
      }),
    ),
  contextPreview: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/context-preview`, z.object({ context: contextPreviewSchema })),
  branches: (conversationId: string) =>
    contract(`/api/conversations/${conversationId}/branches`, z.object({ branches: conversationBranchSchema })),
  generation: (generationId: string) =>
    contract(`/api/generations/${generationId}`, z.object({ generation: generationSchema })),
  cancelGeneration: (generationId: string) =>
    contract(`/api/generations/${generationId}/cancel`, z.object({ cancelled: z.boolean(), status: z.string() })),
  providers: () => contract('/api/model-providers', z.object({ providers: z.array(modelProviderSchema) })),
  createProvider: () => contract('/api/model-providers', providerResponse),
  updateProvider: (providerId: string) => contract(`/api/model-providers/${providerId}`, providerResponse),
  deleteProvider: (providerId: string) => contract(`/api/model-providers/${providerId}`, z.undefined()),
  defaultProvider: (providerId: string) => contract(`/api/model-providers/${providerId}/default`, providerResponse),
  providerHealth: (providerId: string) =>
    contract(`/api/model-providers/${providerId}/health`, z.object({ health: modelHealthSchema })),
  checkProvider: (providerId: string) =>
    contract(`/api/model-providers/${providerId}/check`, z.object({ health: modelHealthSchema })),
  runtime: () => contract('/api/runtime', z.object({ runtime: runtimeStatusSchema })),
  runtimeMods: () => contract('/api/mods', z.object({ mods: z.array(runtimeModSchema) })),
  promptProfile: () => contract('/api/prompts', z.object({ profile: promptProfileSchema })),
  promptAudit: () => contract('/api/prompts/audit', z.object({ audit: promptAuditSchema })),
  updateRuntimeMod: (modId: string) => contract(`/api/mods/${modId}`, z.object({ mod: runtimeModSchema })),
  backups: () => contract('/api/backups', z.object({ backups: z.array(backupItemSchema) })),
  createBackup: () => contract('/api/backups', z.object({ backup: backupItemSchema })),
  restoreBackup: (name: string) =>
    contract(
      `/api/backups/${encodeURIComponent(name)}/restore`,
      z.object({
        restore: z.object({ restored: z.string(), safetyBackup: backupItemSchema, tableCount: z.number() }),
      }),
    ),
}

export const apiPaths = {
  exportStory: (storyId: string) => `/api/story-cards/${storyId}/export/json`,
  exportConversation: (conversationId: string) => `/api/conversations/${conversationId}/export/markdown`,
  sendMessage: (conversationId: string) => `/api/conversations/${conversationId}/messages`,
  retryMessage: (messageId: string) => `/api/messages/${messageId}/retry`,
  regenerate: (conversationId: string) => `/api/conversations/${conversationId}/regenerate`,
  editAndRetry: (messageId: string) => `/api/messages/${messageId}/edit-and-retry`,
  downloadBackup: (name: string) => `/api/backups/${encodeURIComponent(name)}/download`,
}
