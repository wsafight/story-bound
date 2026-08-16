import { createEditAndRetrySchema, createSendMessageSchema, createStoryDraftSchema } from '@storybound/shared/schemas'
import { config } from '../config'

export {
  type CloseChapterInput,
  type CreateConversationInput,
  type CreateModelProviderInput,
  type CreateStateSuggestionInput,
  closeChapterSchema,
  createConversationSchema,
  createModelProviderSchema,
  createStateSuggestionSchema,
  type ForkConversationInput,
  forkConversationSchema,
  type NarrativePreferences,
  narrativePreferencesSchema,
  type PinMemoryInput,
  pinMemorySchema,
  type ResolveStateSuggestionInput,
  regenerateSchema,
  resolveStateSuggestionSchema,
  retrySchema,
  type SelectReplyCandidateInput,
  type SendMessageInput,
  type StoryDraftInput,
  selectReplyCandidateSchema,
  type UpdateConversationInput,
  type UpdateConversationModInput,
  type UpdateConversationStateInput,
  type UpdateModelProviderInput,
  type UpdateNodeProgressInput,
  type UpdateRuntimeModInput,
  type UseAbilityInput,
  updateConversationModSchema,
  updateConversationSchema,
  updateConversationStateSchema,
  updateModelProviderSchema,
  updateNodeProgressSchema,
  updateRuntimeModSchema,
  useAbilitySchema,
} from '@storybound/shared/schemas'

const options = { maxMessageChars: config.maxMessageChars }

export const sendMessageSchema = createSendMessageSchema(options)
export const editAndRetrySchema = createEditAndRetrySchema(options)
export const storyDraftSchema = createStoryDraftSchema(options)
