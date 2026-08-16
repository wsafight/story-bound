import type { Database } from 'bun:sqlite'
import { type Context, Service } from '@deepseek-ai/cordis'
import type { CreateConversationInput, UpdateConversationInput, UpdateConversationModInput } from '../../domain/schemas'
import { ConversationsRepository, mapMessage } from '../../repositories/conversations'
import {
  closeChapter,
  createStateSuggestion,
  exportConversationMarkdown,
  forkConversation,
  getConversationBranches,
  getConversationNodeDiagnostics,
  getLorebookDiagnostics,
  getRecallDiagnostics,
  getReplyCandidateComparison,
  getStateFieldHints,
  listStateSuggestions,
  resolveStateSuggestion,
  selectReplyCandidate,
  togglePinnedMemory,
  updateConversation,
  updateConversationNodeProgress,
  updateConversationState,
  useConversationAbility,
} from '../../services/conversationManagementService'
import { createConversation } from '../../services/conversationService'
import {
  cancelGeneration,
  type GenerationEvent,
  getConversationProviderSnapshot,
  getGeneration,
  type PreparedGeneration,
  prepareEditAndRetry,
  prepareRegenerate,
  prepareRetry,
  prepareSend,
  runGeneration,
} from '../../services/generationService'
import { listConversationMods, updateConversationMod } from '../../services/modService'
import { getContextPreview } from '../../services/promptBuilder'
import { AppError } from '../../shared/errors'
import type { StoryboundLlmService } from '../infrastructureRuntime'

declare module '@deepseek-ai/cordis' {
  interface Context {
    conversations: StoryboundConversationsService
  }
}

export class StoryboundConversationsService extends Service {
  private readonly repository: ConversationsRepository

  constructor(
    ctx: Context,
    private readonly database: Database,
    private readonly llm: StoryboundLlmService,
  ) {
    super(ctx, 'conversations')
    this.repository = new ConversationsRepository(database)
  }

  create(storyId: string, input: CreateConversationInput) {
    const created = createConversation(storyId, input, this.database)
    return this.repository.view(created.id)
  }

  get(conversationId: string) {
    return this.repository.view(conversationId)
  }

  update(conversationId: string, input: UpdateConversationInput) {
    updateConversation(conversationId, input)
    return this.repository.view(conversationId)
  }

  providerSnapshot(conversationId: string) {
    return getConversationProviderSnapshot(conversationId)
  }

  modelHealth(conversationId: string) {
    return this.llm.health(this.providerSnapshot(conversationId))
  }

  toggleMemory(conversationId: string, input: Parameters<typeof togglePinnedMemory>[1]) {
    return togglePinnedMemory(conversationId, input)
  }

  closeChapter(conversationId: string, input: Parameters<typeof closeChapter>[1]) {
    return closeChapter(conversationId, input)
  }

  updateState(conversationId: string, input: Parameters<typeof updateConversationState>[1]) {
    return updateConversationState(conversationId, input)
  }

  fork(conversationId: string, input: Parameters<typeof forkConversation>[1]) {
    return { conversation: forkConversation(conversationId, input) }
  }

  useAbility(conversationId: string, input: Parameters<typeof useConversationAbility>[1]) {
    return useConversationAbility(conversationId, input)
  }

  createStateSuggestion(conversationId: string, input: Parameters<typeof createStateSuggestion>[1]) {
    return createStateSuggestion(conversationId, input)
  }

  stateSuggestions(conversationId: string) {
    return listStateSuggestions(conversationId)
  }

  stateHints(conversationId: string) {
    return getStateFieldHints(conversationId)
  }

  resolveStateSuggestion(conversationId: string, input: Parameters<typeof resolveStateSuggestion>[1]) {
    return resolveStateSuggestion(conversationId, input)
  }

  lorebookDiagnostics(conversationId: string, currentInput = '') {
    return getLorebookDiagnostics(conversationId, currentInput)
  }

  recallDiagnostics(conversationId: string, currentInput = '') {
    return getRecallDiagnostics(conversationId, currentInput)
  }

  nodes(conversationId: string) {
    return getConversationNodeDiagnostics(conversationId)
  }

  updateNodeProgress(
    conversationId: string,
    nodeId: string,
    action: 'activate' | 'deactivate' | 'complete' | 'skip',
    input: Parameters<typeof updateConversationNodeProgress>[3],
  ) {
    return updateConversationNodeProgress(conversationId, nodeId, action, input)
  }

  branches(conversationId: string) {
    return getConversationBranches(conversationId)
  }

  replyCandidateComparison(conversationId: string) {
    return getReplyCandidateComparison(conversationId)
  }

  exportMarkdown(conversationId: string) {
    return exportConversationMarkdown(conversationId)
  }

  listMods(conversationId: string) {
    return listConversationMods(conversationId)
  }

  updateMod(conversationId: string, modId: string, input: UpdateConversationModInput) {
    return updateConversationMod(conversationId, modId, input)
  }

  messages(conversationId: string, options: { before?: string; limit?: number }) {
    const conversation = this.repository.row(conversationId)
    if (!conversation || conversation.status === 'trashed') {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
    }
    const page = this.repository.pathPage(conversationId, options, String(conversation.active_leaf_message_id || ''))
    const messages = page.rows.map(mapMessage)
    return {
      messages,
      events: this.repository.events(
        conversationId,
        messages.map((message) => String(message.id)),
      ),
      page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
    }
  }

  replyCandidates(conversationId: string) {
    const conversation = this.repository.row(conversationId)
    if (!conversation || conversation.status === 'trashed') {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
    }
    return this.repository.replyCandidates(conversationId, String(conversation.active_leaf_message_id || ''))
  }

  selectReply(conversationId: string, input: Parameters<typeof selectReplyCandidate>[1]) {
    return selectReplyCandidate(conversationId, input)
  }

  contextPreview(conversationId: string) {
    return getContextPreview(conversationId)
  }

  prepareSend(conversationId: string, input: Parameters<typeof prepareSend>[1]) {
    return prepareSend(conversationId, input)
  }

  prepareRetry(messageId: string, expectedLeafMessageId: string) {
    return prepareRetry(messageId, expectedLeafMessageId)
  }

  prepareRegenerate(conversationId: string, input: Parameters<typeof prepareRegenerate>[1]) {
    return prepareRegenerate(conversationId, input)
  }

  prepareEdit(messageId: string, input: Parameters<typeof prepareEditAndRetry>[1]) {
    return prepareEditAndRetry(messageId, input)
  }

  run(prepared: PreparedGeneration, emit: (event: GenerationEvent) => void) {
    return runGeneration(prepared, emit, this.llm)
  }

  generation(generationId: string) {
    return getGeneration(generationId)
  }

  cancel(generationId: string) {
    return cancelGeneration(generationId)
  }
}
